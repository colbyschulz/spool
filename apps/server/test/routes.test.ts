import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import { PubMedClient } from "../src/pubmed/client.js";

const xml = readFileSync(
  fileURLToPath(new URL("./fixtures/efetch-sample.xml", import.meta.url)),
  "utf8",
);

const emptyXml = `<?xml version="1.0" ?><PubmedArticleSet></PubmedArticleSet>`;

function clientWith(pmids: string[]) {
  const fetchFn = vi.fn(async (url: string) =>
    url.includes("esearch")
      ? new Response(JSON.stringify({ esearchresult: { idlist: pmids } }), { status: 200 })
      : new Response(xml, { status: 200 }),
  );
  return new PubMedClient({ fetchFn, retryDelayMs: 0, ratePerSec: 1000 });
}

function clientAlwaysStatus(status: number) {
  const fetchFn = vi.fn(async () => new Response("", { status }));
  return new PubMedClient({ fetchFn, retryDelayMs: 0, ratePerSec: 1000 });
}

function clientEmptyEfetch() {
  // esearch returns a pmid, but efetch returns an empty set (unknown pmid)
  const fetchFn = vi.fn(async (url: string) =>
    url.includes("esearch")
      ? new Response(JSON.stringify({ esearchresult: { idlist: ["99999999"] } }), { status: 200 })
      : new Response(emptyXml, { status: 200 }),
  );
  return new PubMedClient({ fetchFn, retryDelayMs: 0, ratePerSec: 1000 });
}

describe("routes", () => {
  it("GET /api/authors/search returns candidates", async () => {
    const app = buildApp({ client: clientWith(["30049270", "29939134"]) });
    const res = await app.inject({ method: "GET", url: "/api/authors/search?name=Smith%20J" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.candidates)).toBe(true);
  });

  it("GET /api/authors/search 400s without a name", async () => {
    const app = buildApp({ client: clientWith([]) });
    const res = await app.inject({ method: "GET", url: "/api/authors/search" });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/publications/:pmid returns one publication", async () => {
    const app = buildApp({ client: clientWith(["30049270"]) });
    const res = await app.inject({ method: "GET", url: "/api/publications/30049270" });
    expect(res.statusCode).toBe(200);
    expect(res.json().publication.pmid).toMatch(/^\d+$/);
  });

  // --- upstream error mapping ---

  it("upstream 429 → route responds 503 with upstream_unavailable body", async () => {
    const app = buildApp({ client: clientAlwaysStatus(429) });
    const res = await app.inject({ method: "GET", url: "/api/publications/12345678" });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.error).toBe("upstream_unavailable");
    expect(typeof body.message).toBe("string");
  });

  it("upstream 500 → route responds 502 with upstream_unavailable body", async () => {
    const app = buildApp({ client: clientAlwaysStatus(500) });
    const res = await app.inject({ method: "GET", url: "/api/publications/12345678" });
    expect(res.statusCode).toBe(502);
    const body = res.json();
    expect(body.error).toBe("upstream_unavailable");
  });

  // --- 404 for unknown pmid ---

  it("unknown pmid (empty efetch) → 404 with not_found body", async () => {
    const app = buildApp({ client: clientEmptyEfetch() });
    const res = await app.inject({ method: "GET", url: "/api/publications/99999999" });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe("not_found");
    expect(typeof body.message).toBe("string");
  });

  // --- validation ---

  it("non-numeric pmid → 400", async () => {
    const app = buildApp({ client: clientWith([]) });
    const res = await app.inject({ method: "GET", url: "/api/publications/abc" });
    expect(res.statusCode).toBe(400);
  });

  it("10-digit pmid → 400 (maxLength 9)", async () => {
    const app = buildApp({ client: clientWith([]) });
    const res = await app.inject({ method: "GET", url: "/api/publications/1234567890" });
    expect(res.statusCode).toBe(400);
  });

  it("name over 200 chars → 400", async () => {
    const app = buildApp({ client: clientWith([]) });
    const longName = "A".repeat(201);
    const res = await app.inject({
      method: "GET",
      url: `/api/authors/search?name=${encodeURIComponent(longName)}`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("collective author name (digits/parens) → 200 on publications", async () => {
    // The parser emits CollectiveName authors and the graph makes them
    // clickable — the schema must accept them or "follow co-author" 400s.
    const app = buildApp({ client: clientWith(["30049270"]) });
    const res = await app.inject({
      method: "GET",
      url: `/api/authors/publications?name=${encodeURIComponent("COVID-19 Genomics UK (COG-UK) Consortium")}`,
    });
    expect(res.statusCode).toBe(200);
  });

  it("name containing [ → 400", async () => {
    const app = buildApp({ client: clientWith([]) });
    const res = await app.inject({
      method: "GET",
      url: "/api/authors/search?name=%5Binjection",
    });
    expect(res.statusCode).toBe(400);
  });

  it("name with diacritics (Gómez J) → 200", async () => {
    const app = buildApp({ client: clientWith(["30049270"]) });
    const res = await app.inject({
      method: "GET",
      url: `/api/authors/search?name=${encodeURIComponent("Gómez J")}`,
    });
    expect(res.statusCode).toBe(200);
  });

  // --- affiliation filter ---

  it("affiliation filter skipped when param omitted: all publications returned", async () => {
    // Use a client that returns publications with no affiliation on the authors
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("esearch")) {
        return new Response(JSON.stringify({ esearchresult: { idlist: ["30049270"] } }), {
          status: 200,
        });
      }
      // Return a publication where the author has no affiliation
      const noAffXml = `<?xml version="1.0" ?><PubmedArticleSet>
        <PubmedArticle><MedlineCitation><PMID>30049270</PMID>
          <Article><ArticleTitle>Test</ArticleTitle>
            <Journal><Title>J</Title><ISOAbbreviation>J</ISOAbbreviation>
              <JournalIssue><PubDate><Year>2020</Year></PubDate></JournalIssue>
            </Journal>
            <AuthorList><Author><LastName>Smith</LastName><ForeName>J</ForeName></Author></AuthorList>
          </Article>
        </MedlineCitation>
        <PubmedData><ArticleIdList><ArticleId IdType="pubmed">30049270</ArticleId></ArticleIdList></PubmedData>
        </PubmedArticle></PubmedArticleSet>`;
      return new Response(noAffXml, { status: 200 });
    });
    const client = new PubMedClient({ fetchFn, retryDelayMs: 0, ratePerSec: 1000 });
    const app = buildApp({ client });
    // No affiliation param — should return publications
    const res = await app.inject({
      method: "GET",
      url: "/api/authors/publications?name=Smith%20J",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.publications)).toBe(true);
    expect(body.publications.length).toBeGreaterThan(0);
  });

  it("affiliation match is case/whitespace-insensitive", async () => {
    // Create a client returning a pub where the author affiliation is 'mit media lab'
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("esearch")) {
        return new Response(JSON.stringify({ esearchresult: { idlist: ["11111111"] } }), {
          status: 200,
        });
      }
      const affXml = `<?xml version="1.0" ?><PubmedArticleSet>
        <PubmedArticle><MedlineCitation><PMID>11111111</PMID>
          <Article><ArticleTitle>Affiliation Test</ArticleTitle>
            <Journal><Title>J</Title><ISOAbbreviation>J</ISOAbbreviation>
              <JournalIssue><PubDate><Year>2021</Year></PubDate></JournalIssue>
            </Journal>
            <AuthorList>
              <Author>
                <LastName>Smith</LastName><ForeName>J</ForeName>
                <AffiliationInfo><Affiliation>mit media lab</Affiliation></AffiliationInfo>
              </Author>
            </AuthorList>
          </Article>
        </MedlineCitation>
        <PubmedData><ArticleIdList><ArticleId IdType="pubmed">11111111</ArticleId></ArticleIdList></PubmedData>
        </PubmedArticle></PubmedArticleSet>`;
      return new Response(affXml, { status: 200 });
    });
    const client = new PubMedClient({ fetchFn, retryDelayMs: 0, ratePerSec: 1000 });
    const app = buildApp({ client });
    // Query with mixed case + extra whitespace
    const res = await app.inject({
      method: "GET",
      url: `/api/authors/publications?name=Smith%20J&affiliation=${encodeURIComponent("MIT  Media Lab")}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.publications.length).toBe(1);
    expect(body.publications[0].pmid).toBe("11111111");
  });

  // --- rate limiting ---

  it("rate limit: /api/authors/search responds 429 with rate_limited body after 30 requests", async () => {
    // Use a cached client so the 31 requests all resolve immediately after the first.
    const client = clientWith(["30049270"]);
    const app = buildApp({ client });

    const statuses: number[] = [];
    let lastBody: unknown = null;
    for (let i = 0; i < 31; i++) {
      const res = await app.inject({
        method: "GET",
        url: "/api/authors/search?name=Smith%20J",
      });
      statuses.push(res.statusCode);
      lastBody = res.json();
    }
    // The limit is exactly 30/min: request 30 still passes, request 31 trips it.
    expect(statuses[29]).toBe(200);
    expect(statuses[30]).toBe(429);
    const body = lastBody as Record<string, unknown>;
    expect(body.error).toBe("rate_limited");
  });

  // --- health route ---

  it("GET /api/health → 200 { status: 'ok' }", async () => {
    const app = buildApp({ client: clientWith([]) });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
