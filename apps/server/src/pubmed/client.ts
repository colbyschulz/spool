import { LRUCache } from "lru-cache";
import type { Publication } from "@spool/shared";
import { esearchUrl, efetchUrl } from "./eutils.js";
import { parsePublications } from "./parse.js";
import { RateLimiter } from "./throttle.js";
import { UpstreamError } from "./errors.js";

type FetchFn = (url: string) => Promise<Response>;

interface ClientOptions {
  fetchFn?: FetchFn;
  ttlMs?: number;
  /** Calls per second toward NCBI. Defaults to 9 with an API key, 3 without. */
  ratePerSec?: number;
  retryDelayMs?: number;
}

const FETCH_TIMEOUT_MS = 10_000;

export class PubMedClient {
  private fetchFn: FetchFn;
  private limiter: RateLimiter;
  private retryDelayMs: number;
  // Separate caches: esearch results live for 30 min, full publications for 6 h.
  private esearchCache: LRUCache<string, string[]>;
  private efetchCache: LRUCache<string, Publication[]>;
  // Concurrent identical requests share one upstream call.
  private inflight = new Map<string, Promise<unknown>>();

  constructor(opts: ClientOptions = {}) {
    this.fetchFn =
      opts.fetchFn ?? ((url) => fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }));
    this.limiter = new RateLimiter(opts.ratePerSec ?? (process.env.NCBI_API_KEY ? 9 : 3));
    this.retryDelayMs = opts.retryDelayMs ?? 1000;
    this.esearchCache = new LRUCache({ max: 200, ttl: opts.ttlMs ?? 1000 * 60 * 30 });
    this.efetchCache = new LRUCache({ max: 500, ttl: opts.ttlMs ?? 1000 * 60 * 60 * 6 });
  }

  private async fetchUpstream(url: string, operation: string): Promise<Response> {
    let res = await this.limiter.schedule(() => this.fetchFn(url));
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, this.retryDelayMs));
      res = await this.limiter.schedule(() => this.fetchFn(url));
    }
    if (!res.ok) throw new UpstreamError(res.status, operation);
    return res;
  }

  private coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const p = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async efetch(pmids: string[]): Promise<Publication[]> {
    if (pmids.length === 0) return [];
    const key = `efetch:${pmids.join(",")}`;
    const cached = this.efetchCache.get(key);
    if (cached) return cached;
    return this.coalesce(key, async () => {
      const res = await this.fetchUpstream(efetchUrl(pmids), "efetch");
      const pubs = parsePublications(await res.text());
      this.efetchCache.set(key, pubs);
      return pubs;
    });
  }

  async searchAuthorPublications(authorName: string, retmax: number): Promise<Publication[]> {
    // Collapse whitespace so the cache key always matches the query sent to NCBI.
    const query = authorName.trim().replace(/\s+/g, " ");
    const esearchKey = `esearch:${query.toLowerCase()}:${retmax}`;
    let pmids = this.esearchCache.get(esearchKey);
    if (!pmids) {
      pmids = await this.coalesce(esearchKey, async () => {
        const res = await this.fetchUpstream(esearchUrl(query, retmax), "esearch");
        const json = (await res.json()) as { esearchresult?: { idlist?: string[] } };
        const ids = json.esearchresult?.idlist ?? [];
        this.esearchCache.set(esearchKey, ids);
        return ids;
      });
    }
    return this.efetch(pmids);
  }

  async getPublication(pmid: string): Promise<Publication | undefined> {
    const pubs = await this.efetch([pmid]);
    return pubs[0];
  }
}
