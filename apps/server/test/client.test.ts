import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PubMedClient } from "../src/pubmed/client.js";

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
    const client = new PubMedClient({ fetchFn });
    const pubs = await client.searchAuthorPublications("Smith J", 50);
    expect(pubs.length).toBe(2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("caches identical efetch calls", async () => {
    const fetchFn = fakeFetch(["30049270"]);
    const client = new PubMedClient({ fetchFn });
    await client.getPublication("30049270");
    await client.getPublication("30049270");
    // 1 efetch call; the second is served from cache.
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
