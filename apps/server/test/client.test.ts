import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PubMedClient } from "../src/pubmed/client.js";
import { UpstreamError } from "../src/pubmed/errors.js";

const xml = readFileSync(
  fileURLToPath(new URL("./fixtures/efetch-sample.xml", import.meta.url)),
  "utf8",
);

function fakeFetch(esearchPmids: string[]) {
  return vi.fn(async (url: string) => {
    if (url.includes("esearch")) {
      return new Response(JSON.stringify({ esearchresult: { idlist: esearchPmids } }), {
        status: 200,
      });
    }
    return new Response(xml, { status: 200 });
  });
}

describe("PubMedClient", () => {
  it("searchAuthorPublications resolves pmids then fetches records", async () => {
    const fetchFn = fakeFetch(["30049270", "29939134"]);
    const client = new PubMedClient({ fetchFn, retryDelayMs: 0, ratePerSec: 1000 });
    const pubs = await client.searchAuthorPublications("Smith J", 50);
    expect(pubs.length).toBe(2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("caches identical efetch calls", async () => {
    const fetchFn = fakeFetch(["30049270"]);
    const client = new PubMedClient({ fetchFn, retryDelayMs: 0, ratePerSec: 1000 });
    await client.getPublication("30049270");
    await client.getPublication("30049270");
    // 1 efetch call; the second is served from cache.
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("throws UpstreamError with upstreamStatus 429 after two attempts when upstream always 429", async () => {
    const fetchFn = vi.fn(async () => new Response("rate limited", { status: 429 }));
    const client = new PubMedClient({ fetchFn, retryDelayMs: 0, ratePerSec: 1000 });
    await expect(client.searchAuthorPublications("Smith J", 10)).rejects.toMatchObject({
      upstreamStatus: 429,
    });
    await expect(client.searchAuthorPublications("Smith J", 10)).rejects.toBeInstanceOf(UpstreamError);
    // Each call retries once => 2 fetches per call; we made 2 calls => 4 total
    expect(fetchFn.mock.calls.length).toBe(4);
  });

  it("succeeds when first call returns 500 and retry returns 200", async () => {
    let callCount = 0;
    const fetchFn = vi.fn(async (url: string) => {
      callCount++;
      if (callCount === 1) return new Response("server error", { status: 500 });
      if (url.includes("esearch")) {
        return new Response(JSON.stringify({ esearchresult: { idlist: ["30049270"] } }), {
          status: 200,
        });
      }
      return new Response(xml, { status: 200 });
    });
    const client = new PubMedClient({ fetchFn, retryDelayMs: 0, ratePerSec: 1000 });
    const pubs = await client.searchAuthorPublications("Smith J", 10);
    expect(pubs.length).toBeGreaterThan(0);
    // First esearch attempt (500) + retry (200) + efetch (200) = 3 total
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("cache key normalization: padded/cased author names share one esearch fetch", async () => {
    const fetchFn = fakeFetch(["30049270"]);
    const client = new PubMedClient({ fetchFn, retryDelayMs: 0, ratePerSec: 1000 });
    await client.searchAuthorPublications("Smith J", 10);
    await client.searchAuthorPublications(" smith  j ", 10);
    // Two esearch calls would equal 4 total (2 esearch + 2 efetch).
    // With normalization, second esearch is cached => 1 esearch + 1 efetch = 2 fetches total
    // (the second call's efetch is also cached)
    const esearchCalls = fetchFn.mock.calls.filter(([url]: [string]) => url.includes("esearch"));
    expect(esearchCalls.length).toBe(1);
  });

  it("coalescing: concurrent identical requests produce one esearch and one efetch", async () => {
    let resolveGate!: () => void;
    const gate = new Promise<void>((res) => {
      resolveGate = res;
    });

    let esearchCallCount = 0;
    let efetchCallCount = 0;

    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("esearch")) {
        esearchCallCount++;
        await gate;
        return new Response(JSON.stringify({ esearchresult: { idlist: ["30049270"] } }), {
          status: 200,
        });
      }
      efetchCallCount++;
      await gate;
      return new Response(xml, { status: 200 });
    });

    const client = new PubMedClient({ fetchFn, retryDelayMs: 0, ratePerSec: 1000 });

    // Start both concurrently before either resolves
    const p1 = client.searchAuthorPublications("Smith J", 10);
    const p2 = client.searchAuthorPublications("Smith J", 10);

    // Release the gate so both can complete
    resolveGate();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.length).toBeGreaterThan(0);
    expect(r2.length).toBeGreaterThan(0);
    expect(esearchCallCount).toBe(1);
    expect(efetchCallCount).toBe(1);
  });
});
