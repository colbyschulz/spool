import { describe, it, expect, afterEach, vi } from "vitest";
import { esearchUrl, efetchUrl } from "../src/pubmed/eutils.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("eutils URL builders", () => {
  it("builds an esearch URL for an author with retmax", () => {
    vi.stubEnv("NCBI_API_KEY", "");
    vi.stubEnv("NCBI_CONTACT_EMAIL", "");
    const u = new URL(esearchUrl("Smith J", 50));
    expect(u.pathname).toContain("esearch.fcgi");
    expect(u.searchParams.get("db")).toBe("pubmed");
    expect(u.searchParams.get("term")).toBe("Smith J[Author]");
    expect(u.searchParams.get("retmax")).toBe("50");
    expect(u.searchParams.get("retmode")).toBe("json");
  });

  it("builds an efetch URL for a list of pmids", () => {
    vi.stubEnv("NCBI_API_KEY", "");
    vi.stubEnv("NCBI_CONTACT_EMAIL", "");
    const u = new URL(efetchUrl(["111", "222"]));
    expect(u.pathname).toContain("efetch.fcgi");
    expect(u.searchParams.get("db")).toBe("pubmed");
    expect(u.searchParams.get("id")).toBe("111,222");
    expect(u.searchParams.get("retmode")).toBe("xml");
  });

  it("esearch URL contains sort=pub_date (not pub%2Bdate)", () => {
    vi.stubEnv("NCBI_API_KEY", "");
    vi.stubEnv("NCBI_CONTACT_EMAIL", "");
    const raw = esearchUrl("Smith J", 10);
    // The raw string should contain sort=pub_date
    expect(raw).toContain("sort=pub_date");
    // And must NOT contain the double-encoded form
    expect(raw).not.toContain("pub%2Bdate");
    expect(raw).not.toContain("pub+date");
    // Also verify via URL parsing
    const u = new URL(raw);
    expect(u.searchParams.get("sort")).toBe("pub_date");
  });

  it("tool=spool is always present on esearch URLs", () => {
    vi.stubEnv("NCBI_API_KEY", "");
    vi.stubEnv("NCBI_CONTACT_EMAIL", "");
    const u = new URL(esearchUrl("Smith J", 10));
    expect(u.searchParams.get("tool")).toBe("spool");
  });

  it("tool=spool is always present on efetch URLs", () => {
    vi.stubEnv("NCBI_API_KEY", "");
    vi.stubEnv("NCBI_CONTACT_EMAIL", "");
    const u = new URL(efetchUrl(["111"]));
    expect(u.searchParams.get("tool")).toBe("spool");
  });

  it("api_key is absent when NCBI_API_KEY is not set", () => {
    vi.stubEnv("NCBI_API_KEY", "");
    vi.stubEnv("NCBI_CONTACT_EMAIL", "");
    const esearch = new URL(esearchUrl("Smith J", 10));
    const efetch = new URL(efetchUrl(["111"]));
    expect(esearch.searchParams.get("api_key")).toBeNull();
    expect(efetch.searchParams.get("api_key")).toBeNull();
  });

  it("api_key appears on both URLs when NCBI_API_KEY is set", () => {
    vi.stubEnv("NCBI_API_KEY", "test-key-123");
    vi.stubEnv("NCBI_CONTACT_EMAIL", "");
    const esearch = new URL(esearchUrl("Smith J", 10));
    const efetch = new URL(efetchUrl(["111"]));
    expect(esearch.searchParams.get("api_key")).toBe("test-key-123");
    expect(efetch.searchParams.get("api_key")).toBe("test-key-123");
  });

  it("email is absent when NCBI_CONTACT_EMAIL is not set", () => {
    vi.stubEnv("NCBI_API_KEY", "");
    vi.stubEnv("NCBI_CONTACT_EMAIL", "");
    const esearch = new URL(esearchUrl("Smith J", 10));
    const efetch = new URL(efetchUrl(["111"]));
    expect(esearch.searchParams.get("email")).toBeNull();
    expect(efetch.searchParams.get("email")).toBeNull();
  });

  it("email appears on both URLs when NCBI_CONTACT_EMAIL is set", () => {
    vi.stubEnv("NCBI_API_KEY", "");
    vi.stubEnv("NCBI_CONTACT_EMAIL", "test@example.com");
    const esearch = new URL(esearchUrl("Smith J", 10));
    const efetch = new URL(efetchUrl(["111"]));
    expect(esearch.searchParams.get("email")).toBe("test@example.com");
    expect(efetch.searchParams.get("email")).toBe("test@example.com");
  });
});
