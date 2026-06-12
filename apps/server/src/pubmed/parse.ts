import { XMLParser } from "fast-xml-parser";
import type { Author, Publication } from "@spool/shared";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Force these to always be arrays so single/multi cases are uniform.
  isArray: (name) => ["PubmedArticle", "Author", "AffiliationInfo"].includes(name),
  // Keep raw inner XML for these nodes so inline markup isn't silently dropped.
  stopNodes: ["*.ArticleTitle", "*.Affiliation"],
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Strip residual inline tags (<i>, <sub>…) and decode basic entities from stop-node text. */
function stripMarkup(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function textOf(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return stripMarkup(String(node));
  // fast-xml-parser puts mixed text under "#text"
  const t = (node as Record<string, unknown>)["#text"];
  return t == null ? "" : stripMarkup(String(t));
}

/** Safe property access on an unknown value. */
function prop(obj: unknown, key: string): unknown {
  return typeof obj === "object" && obj !== null
    ? (obj as Record<string, unknown>)[key]
    : undefined;
}

function authorName(a: unknown): string {
  const last = textOf(prop(a, "LastName"));
  const initials = textOf(prop(a, "Initials"));
  const collective = textOf(prop(a, "CollectiveName"));
  if (last) return initials ? `${last} ${initials}` : last;
  return collective;
}

function authorAffiliation(a: unknown): string | undefined {
  const infos = asArray(prop(a, "AffiliationInfo"));
  const first = infos[0];
  const aff = first ? textOf(prop(first, "Affiliation")) : "";
  return aff || undefined;
}

export function parsePublications(xml: string): Publication[] {
  let root: unknown;
  try {
    root = parser.parse(xml);
  } catch {
    // fxp is lenient with garbage strings today; this guards against future parser changes.
    return [];
  }

  const articles = asArray(prop(prop(root, "PubmedArticleSet"), "PubmedArticle"));

  return articles
    .map((article: unknown): Publication | null => {
      const citation = prop(article, "MedlineCitation");
      const art = prop(citation, "Article");
      if (!citation || !art) return null;

      const pmid = String(textOf(prop(citation, "PMID")));
      const title = textOf(prop(art, "ArticleTitle"));
      const journal = textOf(prop(prop(art, "Journal"), "Title"));
      const pubDate = prop(prop(prop(art, "Journal"), "JournalIssue"), "PubDate");
      const yearRaw = textOf(prop(pubDate, "Year"));
      const year = yearRaw ? Number(yearRaw) : undefined;

      const authors: Author[] = asArray(prop(prop(art, "AuthorList"), "Author"))
        .map((a: unknown) => ({
          name: authorName(a),
          affiliation: authorAffiliation(a),
        }))
        .filter((a) => a.name.length > 0);

      return {
        pmid,
        title,
        journal,
        year: Number.isFinite(year) ? year : undefined,
        authors,
        pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      };
    })
    .filter((p): p is Publication => p !== null);
}
