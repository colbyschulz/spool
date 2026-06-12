import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parsePublications } from "../src/pubmed/parse.js";

const xml = readFileSync(
  fileURLToPath(new URL("./fixtures/efetch-sample.xml", import.meta.url)),
  "utf8",
);

describe("parsePublications", () => {
  const pubs = parsePublications(xml);

  it("parses every article", () => {
    expect(pubs.length).toBe(2);
  });

  it("extracts pmid, title, journal and a pubmed url", () => {
    const p = pubs[0]!;
    expect(p.pmid).toMatch(/^\d+$/);
    expect(p.title.length).toBeGreaterThan(0);
    expect(p.journal.length).toBeGreaterThan(0);
    expect(p.pubmedUrl).toBe(`https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`);
  });

  it("extracts an author list with names", () => {
    const p = pubs[0]!;
    expect(p.authors.length).toBeGreaterThan(0);
    expect(p.authors[0]!.name.length).toBeGreaterThan(0);
  });
});

describe("parsePublications — inline markup", () => {
  const markupXml = `<?xml version="1.0"?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>99999999</PMID>
      <Article>
        <ArticleTitle>Effects of <i>E. coli</i> on growth</ArticleTitle>
        <Journal>
          <Title>Test Journal</Title>
          <JournalIssue>
            <PubDate><Year>2024</Year></PubDate>
          </JournalIssue>
        </Journal>
        <AuthorList>
          <Author>
            <LastName>Smith</LastName>
            <Initials>J</Initials>
            <AffiliationInfo>
              <Affiliation><sup>1</sup>MIT</Affiliation>
            </AffiliationInfo>
          </Author>
        </AuthorList>
      </Article>
    </MedlineCitation>
  </PubmedArticle>
</PubmedArticleSet>`;

  it("strips inline tags from ArticleTitle, keeping surrounding text", () => {
    const pubs = parsePublications(markupXml);
    expect(pubs).toHaveLength(1);
    expect(pubs[0]!.title).toBe("Effects of E. coli on growth");
  });

  it("strips inline tags from Affiliation, keeping surrounding text", () => {
    const pubs = parsePublications(markupXml);
    expect(pubs).toHaveLength(1);
    // <sup>1</sup>MIT -> "1MIT": tags stripped, their text kept; no space existed between them.
    expect(pubs[0]!.authors[0]!.affiliation).toBe("1MIT");
  });
});

describe("parsePublications — edge cases", () => {
  it("returns [] for garbage input", () => {
    expect(parsePublications("not xml at all")).toEqual([]);
  });

  it("returns [] for an empty article set", () => {
    expect(parsePublications("<PubmedArticleSet/>")).toEqual([]);
  });
});
