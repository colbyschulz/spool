import { XMLParser } from "fast-xml-parser";
import type { Author, Publication } from "@spool/shared";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Force these to always be arrays so single/multi cases are uniform.
  isArray: (name) => ["PubmedArticle", "Author", "AffiliationInfo"].includes(name),
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  // fast-xml-parser puts mixed text under "#text"
  const t = (node as Record<string, unknown>)["#text"];
  return t == null ? "" : String(t);
}

function authorName(a: Record<string, unknown>): string {
  const last = textOf(a["LastName"]);
  const initials = textOf(a["Initials"]);
  const collective = textOf(a["CollectiveName"]);
  if (last) return initials ? `${last} ${initials}` : last;
  return collective;
}

function authorAffiliation(a: Record<string, unknown>): string | undefined {
  const infos = asArray(a["AffiliationInfo"] as unknown);
  const first = infos[0] as Record<string, unknown> | undefined;
  const aff = first ? textOf(first["Affiliation"]) : "";
  return aff || undefined;
}

export function parsePublications(xml: string): Publication[] {
  const root = parser.parse(xml) as Record<string, any>;
  const articles = asArray(root?.PubmedArticleSet?.PubmedArticle);

  return articles
    .map((article: any): Publication | null => {
      const citation = article?.MedlineCitation;
      const art = citation?.Article;
      if (!citation || !art) return null;

      const pmid = String(textOf(citation.PMID));
      const title = textOf(art.ArticleTitle);
      const journal = textOf(art?.Journal?.Title);
      const yearRaw = textOf(art?.Journal?.JournalIssue?.PubDate?.Year);
      const year = yearRaw ? Number(yearRaw) : undefined;

      const authors: Author[] = asArray(art?.AuthorList?.Author)
        .map((a: Record<string, unknown>) => ({
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
