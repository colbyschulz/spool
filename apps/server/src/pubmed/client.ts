import { LRUCache } from "lru-cache";
import type { Publication } from "@skein/shared";
import { esearchUrl, efetchUrl } from "./eutils.js";
import { parsePublications } from "./parse.js";

type FetchFn = (url: string) => Promise<Response>;

interface ClientOptions {
  fetchFn?: FetchFn;
  ttlMs?: number;
}

export class PubMedClient {
  private fetchFn: FetchFn;
  private cache: LRUCache<string, Publication[]>;

  constructor(opts: ClientOptions = {}) {
    this.fetchFn = opts.fetchFn ?? ((url) => fetch(url));
    this.cache = new LRUCache({ max: 500, ttl: opts.ttlMs ?? 1000 * 60 * 60 * 6 });
  }

  private async efetch(pmids: string[]): Promise<Publication[]> {
    if (pmids.length === 0) return [];
    const key = `efetch:${pmids.join(",")}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const res = await this.fetchFn(efetchUrl(pmids));
    if (!res.ok) throw new Error(`efetch failed: ${res.status}`);
    const pubs = parsePublications(await res.text());
    this.cache.set(key, pubs);
    return pubs;
  }

  async searchAuthorPublications(authorName: string, retmax: number): Promise<Publication[]> {
    const res = await this.fetchFn(esearchUrl(authorName, retmax));
    if (!res.ok) throw new Error(`esearch failed: ${res.status}`);
    const json = (await res.json()) as { esearchresult?: { idlist?: string[] } };
    const pmids = json.esearchresult?.idlist ?? [];
    return this.efetch(pmids);
  }

  async getPublication(pmid: string): Promise<Publication | undefined> {
    const pubs = await this.efetch([pmid]);
    return pubs[0];
  }
}
