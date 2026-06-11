import { describe, it, expect } from "vitest";
import { esearchUrl, efetchUrl } from "../src/pubmed/eutils.js";

describe("eutils URL builders", () => {
  it("builds an esearch URL for an author with retmax", () => {
    const u = new URL(esearchUrl("Smith J", 50));
    expect(u.pathname).toContain("esearch.fcgi");
    expect(u.searchParams.get("db")).toBe("pubmed");
    expect(u.searchParams.get("term")).toBe("Smith J[Author]");
    expect(u.searchParams.get("retmax")).toBe("50");
    expect(u.searchParams.get("retmode")).toBe("json");
  });

  it("builds an efetch URL for a list of pmids", () => {
    const u = new URL(efetchUrl(["111", "222"]));
    expect(u.pathname).toContain("efetch.fcgi");
    expect(u.searchParams.get("db")).toBe("pubmed");
    expect(u.searchParams.get("id")).toBe("111,222");
    expect(u.searchParams.get("retmode")).toBe("xml");
  });

  it("includes api_key when SPOOL_NCBI_API_KEY is set", () => {
    process.env.SPOOL_NCBI_API_KEY = "abc123";
    const u = new URL(esearchUrl("Smith J", 10));
    expect(u.searchParams.get("api_key")).toBe("abc123");
    delete process.env.SPOOL_NCBI_API_KEY;
  });
});
