# Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **HARD RULE (overrides everything):** Never `git commit` or `git push`. Leave all changes in the working tree. This applies to every subagent.

**Goal:** Implement every finding from the 2026-06-12 codebase audit: fix the "Unknown affiliation" contract bug, harden the NCBI integration (API key, throttling, timeouts, coalescing), make TypeScript strictness real across all packages, unify the API contract in `shared/`, and clean up React render hygiene and dead code.

**Architecture:** Contract changes land in `shared/` first (both apps depend on them). Then the server chain (PubMed client hardening → routes/app layer; parse fix in parallel) and the web chain (API layer → graph → hygiene/tsconfig) run as two independent sequences. Tooling/root config last, then full verification.

**Tech Stack:** TypeScript (strict, pinned ~6.0.2), Fastify 4 + @fastify/rate-limit, lru-cache 11, fast-xml-parser, React 19, @tanstack/react-query 5, react-force-graph-2d, Vitest, ESLint flat config.

**Env:** `.env` / `.env.example` already exist at repo root with `NCBI_API_KEY` and `NCBI_CONTACT_EMAIL`. Both are OPTIONAL at runtime — code must work when they're unset.

**Execution order:**

- Task 1 (shared) — blocks everything
- Then in parallel: server chain (Task 2 → Task 3; Task 4 parallel to both) and web chain (Task 5 → Task 6 → Task 7)
- Task 8 (tooling/root) after both chains
- Task 9 (verification) last

---

### Task 1: Shared contract — optional affiliation, helpers, envelopes, dead types

**Files:**
- Modify: `shared/types.ts`
- Test: `shared/types.test.ts`

- [ ] **Step 1: Write failing tests** — append to `shared/types.test.ts`:

```ts
import { authorId, surnameOf, normalizeAffiliation } from "./types.js";

describe("surnameOf", () => {
  it("returns the first whitespace token, trimmed", () => {
    expect(surnameOf("  Smith J ")).toBe("Smith");
  });
  it("returns empty string for whitespace-only input", () => {
    expect(surnameOf("   ")).toBe("");
  });
});

describe("normalizeAffiliation", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(normalizeAffiliation("  MIT   Media Lab ")).toBe("mit media lab");
  });
  it("returns empty string for undefined", () => {
    expect(normalizeAffiliation(undefined)).toBe("");
  });
});

describe("authorId affiliation whitespace", () => {
  it("collapses internal whitespace in affiliation", () => {
    expect(authorId({ name: "Jane Smith", affiliation: "MIT  Media Lab" })).toBe(
      "jane smith|mit media lab",
    );
  });
});
```

- [ ] **Step 2: Run** `npm test -w @spool/shared` — expect new tests FAIL (functions not exported).

- [ ] **Step 3: Implement in `shared/types.ts`:**
  - `AuthorCandidate`: make `affiliation` optional (`affiliation?: string` with JSDoc `/** Undefined when the records list no affiliation for this person. */`), DELETE `samplePublications` field.
  - DELETE `GraphNode`, `GraphLink`, `GraphState` interfaces entirely (zombie exports — verified unused).
  - ADD response envelope + error types:

```ts
/** Response envelope for GET /api/authors/search. */
export interface SearchAuthorsResponse {
  candidates: AuthorCandidate[];
}

/** Response envelope for GET /api/authors/publications. */
export interface AuthorPublicationsResponse {
  publications: Publication[];
}

/** Response envelope for GET /api/publications/:pmid. */
export interface GetPublicationResponse {
  publication: Publication;
}

/** Error body returned by every non-2xx API response. */
export interface ApiError {
  error: string;
  message?: string;
}
```

  - ADD helpers and rewire `authorId`:

```ts
/** First whitespace token of a PubMed-style name ("Smith J" -> "Smith"). */
export function surnameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** Canonical affiliation form for identity/equality: lowercased, trimmed, whitespace-collapsed. */
export function normalizeAffiliation(affiliation: string | undefined): string {
  return (affiliation ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Stable identity key for an author node: normalized name + affiliation. */
export function authorId(author: Author): string {
  const name = author.name.trim().toLowerCase().replace(/\s+/g, " ");
  const aff = normalizeAffiliation(author.affiliation);
  return aff ? `${name}|${aff}` : name;
}
```

  - In `shared/package.json`: add `"private": true`.

- [ ] **Step 4: Run** `npm test -w @spool/shared` — expect PASS. (Server/web will not compile against the new types yet; that is expected and fixed by Tasks 2–7.)

---

### Task 2: Server PubMed plumbing — throttle, retry, timeout, coalescing, env params, sort fix

**Files:**
- Create: `apps/server/src/pubmed/throttle.ts`, `apps/server/src/pubmed/errors.ts`
- Modify: `apps/server/src/pubmed/eutils.ts`, `apps/server/src/pubmed/client.ts`
- Test: `apps/server/test/throttle.test.ts` (new), `apps/server/test/eutils.test.ts`, `apps/server/test/client.test.ts`

- [ ] **Step 1: Create `throttle.ts` with failing test first.** `test/throttle.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { RateLimiter } from "../src/pubmed/throttle.js";

describe("RateLimiter", () => {
  it("spaces call starts by 1/rate seconds", async () => {
    const sleeps: number[] = [];
    let clock = 0;
    const limiter = new RateLimiter(2, {
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });
    await limiter.schedule(async () => "a");
    await limiter.schedule(async () => "b");
    await limiter.schedule(async () => "c");
    // 2/s -> 500ms spacing; first call immediate, next two each wait 500ms
    expect(sleeps).toEqual([500, 500]);
  });

  it("returns the wrapped function's value", async () => {
    const limiter = new RateLimiter(100);
    expect(await limiter.schedule(async () => 42)).toBe(42);
  });
});
```

Implementation `src/pubmed/throttle.ts`:

```ts
interface Clock {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Spaces call starts so at most `ratePerSec` begin per second (NCBI E-utilities policy). */
export class RateLimiter {
  private nextSlot = 0;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly ratePerSec: number,
    clock: Clock = {},
  ) {
    this.now = clock.now ?? (() => Date.now());
    this.sleep = clock.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    const interval = 1000 / this.ratePerSec;
    const now = this.now();
    const start = Math.max(now, this.nextSlot);
    this.nextSlot = start + interval;
    if (start > now) await this.sleep(start - now);
    return fn();
  }
}
```

- [ ] **Step 2: Create `src/pubmed/errors.ts`:**

```ts
/** A failed call to the NCBI E-utilities API. Mapped to 502/503 by the app error handler. */
export class UpstreamError extends Error {
  constructor(
    public readonly upstreamStatus: number,
    public readonly operation: string,
  ) {
    super(`${operation} failed with upstream status ${upstreamStatus}`);
    this.name = "UpstreamError";
  }
}
```

- [ ] **Step 3: `eutils.ts`** — fix sort, add identity params (read env at call time so tests can vary it):

```ts
const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function identityParams(u: URL): void {
  u.searchParams.set("tool", "spool");
  const email = process.env.NCBI_CONTACT_EMAIL;
  if (email) u.searchParams.set("email", email);
  const key = process.env.NCBI_API_KEY;
  if (key) u.searchParams.set("api_key", key);
}

export function esearchUrl(authorName: string, retmax: number): string {
  const u = new URL(`${BASE}/esearch.fcgi`);
  u.searchParams.set("db", "pubmed");
  u.searchParams.set("term", `${authorName.trim()}[Author]`);
  u.searchParams.set("retmax", String(retmax));
  u.searchParams.set("retmode", "json");
  u.searchParams.set("sort", "pub_date"); // newest first — better affiliation data
  identityParams(u);
  return u.toString();
}

export function efetchUrl(pmids: string[]): string {
  const u = new URL(`${BASE}/efetch.fcgi`);
  u.searchParams.set("db", "pubmed");
  u.searchParams.set("id", pmids.join(","));
  u.searchParams.set("retmode", "xml");
  identityParams(u);
  return u.toString();
}
```

Tests (`eutils.test.ts`): adapt existing assertions; add: `sort=pub_date` present (not `pub%2Bdate`); `tool=spool` always present; `api_key`/`email` present only when env vars set (use `vi.stubEnv` and `vi.unstubAllEnvs` in `afterEach`).

- [ ] **Step 4: `client.ts`** — rewrite with timeout, throttle, one retry on 429/5xx, in-flight coalescing, normalized cache keys, `UpstreamError`:

```ts
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
    const query = authorName.trim();
    const esearchKey = `esearch:${query.toLowerCase().replace(/\s+/g, " ")}:${retmax}`;
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
```

- [ ] **Step 5: Extend `client.test.ts`** (keep existing happy-path tests, adapt as needed; construct clients with `retryDelayMs: 0` and a high `ratePerSec` so tests stay fast). Add:
  - throws `UpstreamError` with `upstreamStatus: 429` after retrying once (assert fetch mock called exactly 2×) when upstream always returns 429
  - succeeds when first call 500s and retry 200s (fetch called 2×)
  - cache key normalization: `"Smith J"`, `" smith  j "` produce ONE esearch fetch call total
  - coalescing: two concurrent `searchAuthorPublications` for the same author → exactly one esearch fetch and one efetch
- [ ] **Step 6: Run** `npm test -w @spool/server` — all pass.

---

### Task 3: Server routes + app layer — sentinel removal, validation, error handler, rate limit, health, shutdown, env

**Depends on Task 1 (shared types) and Task 2 (UpstreamError).**

**Files:**
- Modify: `apps/server/src/pubmed/candidates.ts`, `apps/server/src/routes/authors.ts`, `apps/server/src/routes/publications.ts`, `apps/server/src/app.ts`, `apps/server/src/index.ts`, `apps/server/package.json`
- Test: `apps/server/test/candidates.test.ts`, `apps/server/test/routes.test.ts`

- [ ] **Step 1: `candidates.ts`** — kill the sentinel, reuse shared helpers, drop `samplePublications`, export the matcher:

```ts
import { surnameOf, type AuthorCandidate, type Publication } from "@spool/shared";

/** Loose match: the searched author's surname should appear in the author name. */
export function matchesQuery(name: string, query: string): boolean {
  const surname = surnameOf(query).toLowerCase();
  return surname.length > 0 && name.toLowerCase().includes(surname);
}

export function buildCandidates(pubs: Publication[], query: string): AuthorCandidate[] {
  const groups = new Map<string, { affiliation: string | undefined; pubs: Publication[] }>();

  for (const p of pubs) {
    const author = p.authors.find((a) => matchesQuery(a.name, query));
    if (!author) continue;
    const affiliation = author.affiliation?.trim() || undefined;
    const groupKey = affiliation ?? "";
    const existing = groups.get(groupKey) ?? { affiliation, pubs: [] };
    existing.pubs.push(p);
    groups.set(groupKey, existing);
  }

  return [...groups.values()]
    .map(
      (g): AuthorCandidate => ({
        name: query,
        affiliation: g.affiliation,
        paperCount: g.pubs.length,
      }),
    )
    .sort((a, b) => b.paperCount - a.paperCount);
}
```

Update `candidates.test.ts`: the "Unknown affiliation" bucket test now expects `affiliation` to be `undefined`; remove `samplePublications` assertions; add a `matchesQuery` test for leading-whitespace query returning false on empty surname.

- [ ] **Step 2: `routes/authors.ts`** — tighten schema, reuse `matchesQuery` + `normalizeAffiliation`, skip filter when affiliation absent, type the envelopes:

```ts
import type { FastifyInstance } from "fastify";
import {
  normalizeAffiliation,
  type AuthorPublicationsResponse,
  type SearchAuthorsResponse,
} from "@spool/shared";
import type { PubMedClient } from "../pubmed/client.js";
import { buildCandidates, matchesQuery } from "../pubmed/candidates.js";

// Disambiguation only needs a handful of recent papers to identify distinct affiliations.
// Publications panel benefits from a larger set for usefulness.
const DISAMBIG_RETMAX = 10;
const PUBS_RETMAX = 50;

// Author names: letters (any script), spaces, hyphens, periods, apostrophes, commas.
const NAME_SCHEMA = {
  type: "string",
  minLength: 1,
  maxLength: 100,
  pattern: "^[\\p{L}\\p{M}' .,-]+$",
} as const;

export function authorRoutes(app: FastifyInstance, client: PubMedClient): void {
  app.get<{ Querystring: { name?: string } }>(
    "/api/authors/search",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        querystring: {
          type: "object",
          required: ["name"],
          properties: { name: NAME_SCHEMA },
        },
      },
    },
    async (req): Promise<SearchAuthorsResponse> => {
      const name = req.query.name!;
      const pubs = await client.searchAuthorPublications(name, DISAMBIG_RETMAX);
      return { candidates: buildCandidates(pubs, name) };
    },
  );

  app.get<{ Querystring: { name?: string; affiliation?: string } }>(
    "/api/authors/publications",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        querystring: {
          type: "object",
          required: ["name"],
          properties: {
            name: NAME_SCHEMA,
            affiliation: { type: "string", maxLength: 500 },
          },
        },
      },
    },
    async (req): Promise<AuthorPublicationsResponse> => {
      const { name, affiliation } = req.query;
      const pubs = await client.searchAuthorPublications(name!, PUBS_RETMAX);
      const wanted = normalizeAffiliation(affiliation);
      const filtered = wanted
        ? pubs.filter((p) =>
            p.authors.some(
              (a) =>
                matchesQuery(a.name, name!) && normalizeAffiliation(a.affiliation) === wanted,
            ),
          )
        : pubs;
      return { publications: filtered };
    },
  );
}
```

NOTE: Fastify's Ajv needs unicode property escapes; if the `\p{L}` pattern fails at startup, fall back to `"^[A-Za-zÀ-ÖØ-öø-ÿ' .,-]+$"` and say so in your report.

- [ ] **Step 3: `routes/publications.ts`** — add `maxLength: 9` to the pmid pattern schema, type the return as `Promise<GetPublicationResponse>` (import from `@spool/shared`), make the 404 body `{ error: "not_found", message: "publication not found" }`, add `config: { rateLimit: { max: 60, timeWindow: "1 minute" } }`.

- [ ] **Step 4: `app.ts`** — rate limit plugin, error handler, CORS tightening, health route:

```ts
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import type { ApiError } from "@spool/shared";
import { PubMedClient } from "./pubmed/client.js";
import { UpstreamError } from "./pubmed/errors.js";
import { authorRoutes } from "./routes/authors.js";
import { publicationRoutes } from "./routes/publications.js";

interface BuildOptions {
  client?: PubMedClient;
  staticDir?: string;
}

export function buildApp(opts: BuildOptions = {}): FastifyInstance {
  const app = Fastify({ logger: true });
  const client = opts.client ?? new PubMedClient();

  // Production serves the SPA same-origin and dev goes through the Vite proxy,
  // so cross-origin access is only ever needed for ad-hoc local tooling.
  app.register(cors, { origin: process.env.NODE_ENV === "production" ? false : true });
  app.register(rateLimit, { global: false });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof UpstreamError) {
      req.log.error(
        { upstreamStatus: err.upstreamStatus, operation: err.operation },
        "upstream NCBI failure",
      );
      const status = err.upstreamStatus === 429 ? 503 : 502;
      const body: ApiError = {
        error: "upstream_unavailable",
        message: "PubMed is temporarily unavailable",
      };
      return reply.code(status).send(body);
    }
    if (err.validation) {
      const body: ApiError = { error: "bad_request", message: err.message };
      return reply.code(400).send(body);
    }
    if (err.statusCode === 429) {
      const body: ApiError = { error: "rate_limited", message: "Too many requests" };
      return reply.code(429).send(body);
    }
    req.log.error(err);
    const body: ApiError = { error: "internal_error" };
    return reply.code(500).send(body);
  });

  app.get("/api/health", async () => ({ status: "ok" }));

  // Routes are registered inside an async plugin scope so @fastify/rate-limit
  // is ready before their per-route config is read.
  app.register(async (instance) => {
    authorRoutes(instance, client);
    publicationRoutes(instance, client);
  });

  if (opts.staticDir) {
    app.register(fastifyStatic, { root: opts.staticDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        const body: ApiError = { error: "not_found" };
        return reply.code(404).send(body);
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
```

CHECK: per-route `config.rateLimit` requires the plugin to be registered in the same or a parent scope before the route plugins load — verify with a test that a route still answers 200 and that exceeding the limit yields 429 (register a test app, set `max: 1`, call twice). If scoping fights you, registering rateLimit with `global: false` at top level and routes via `app.register(async ...)` as shown is the documented pattern.

- [ ] **Step 5: `index.ts`** — env loading, graceful shutdown, logger:

```ts
import path from "path";
import { buildApp } from "./app.js";

// Local dev secrets (NCBI_API_KEY etc.). Production injects real env vars.
try {
  process.loadEnvFile(path.resolve(import.meta.dirname, "../../../.env"));
} catch {
  // .env is optional
}

const port = Number(process.env.PORT ?? 5174);

// process.cwd() is /app in the Docker container, so apps/web/dist is always reachable.
const staticDir =
  process.env.NODE_ENV === "production"
    ? (process.env.STATIC_DIR ?? path.join(process.cwd(), "apps/web/dist"))
    : undefined;

const app = buildApp({ staticDir });

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

// Railway sends SIGTERM on every deploy — drain in-flight requests before exiting.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}
```

- [ ] **Step 6: `package.json` (server)** — add `"private": true`, script `"typecheck": "tsc --noEmit"`, dependency `"@fastify/rate-limit": "^9.1.0"`. Run `npm install` from the repo root.

- [ ] **Step 7: Extend `routes.test.ts`** (build apps with an injected client whose `fetchFn` is mocked; `retryDelayMs: 0`):
  - upstream 429 → route responds 503 with `{ error: "upstream_unavailable", ... }`
  - upstream 500 → route responds 502
  - unknown pmid (efetch returns empty set XML) → 404 `{ error: "not_found", ... }`
  - non-numeric pmid → 400
  - name over 100 chars → 400; name with `[` → 400
  - affiliation filter: picking a candidate with NO affiliation (param omitted) returns ALL publications
  - affiliation match is case/whitespace-insensitive (`"MIT  Media Lab"` query matches record `"mit media lab"`)
  - rate limit: app with `max: 1` route override answers 200 then 429 `{ error: "rate_limited" }` — if overriding per-route config from the test is awkward, hit the real search route 31 times and assert the 31st is 429
  - `/api/health` → 200 `{ status: "ok" }`
- [ ] **Step 8: Run** `npm test -w @spool/server` — all pass.

---

### Task 4: Server parse — inline markup, `any` cleanup (parallel with Task 3)

**Files:**
- Modify: `apps/server/src/pubmed/parse.ts`
- Test: `apps/server/test/parse.test.ts`

- [ ] **Step 1: Failing test** — add to `parse.test.ts` a minimal inline XML doc (not the fixture) whose `ArticleTitle` is `Effects of <i>E. coli</i> on growth` and an `Affiliation` containing `<sup>1</sup>MIT`; assert title parses to `"Effects of E. coli on growth"` and affiliation to `"1MIT"` or `"MIT"` (strip tags, keep text). Also add: `parsePublications("not xml at all")` returns `[]`, and `parsePublications("<PubmedArticleSet/>")` returns `[]`.
- [ ] **Step 2: Implement:**
  - Parser config: add `stopNodes: ["*.ArticleTitle", "*.Affiliation"]` (raw inner XML preserved as string).
  - Add and apply in `textOf`:

```ts
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
```

  Call `stripMarkup` on the string result inside `textOf` (safe for all fields — PMIDs/years contain no markup).
  - Replace `Record<string, any>` / `(article: any)` (lines 40, 44) with `unknown` + narrowing through the existing `asArray`/`textOf` helpers; introduce a small `prop(obj: unknown, key: string): unknown` helper if useful. No behavior change — existing tests must stay green.
- [ ] **Step 3: Run** `npm test -w @spool/server` — all pass (fixture-based tests included; if the fixture contains markup titles, update expectations to the stripped form deliberately).

---

### Task 5: Web API layer — signals, typed errors, envelopes, sentinel label, dead code

**Depends on Task 1.**

**Files:**
- Modify: `apps/web/src/api/client.ts`, `apps/web/src/api/hooks.ts`, `apps/web/src/api/client.test.ts`, `apps/web/src/lib/author.ts`, `apps/web/src/components/landing.tsx`, `apps/web/src/components/top-bar.tsx`, `apps/web/src/app.tsx` (only if candidate affiliation handling requires it)

- [ ] **Step 1: `client.ts`:**

```ts
import type {
  ApiError,
  AuthorCandidate,
  AuthorPublicationsResponse,
  Publication,
  SearchAuthorsResponse,
} from "@spool/shared";

/** Non-2xx API response, carrying the typed error body when the server sent one. */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail?: ApiError,
  ) {
    super(detail?.message ?? `Request failed: ${status}`);
    this.name = "ApiRequestError";
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    let detail: ApiError | undefined;
    try {
      detail = (await res.json()) as ApiError;
    } catch {
      // non-JSON error body
    }
    throw new ApiRequestError(res.status, detail);
  }
  return (await res.json()) as T;
}

export async function searchAuthors(
  name: string,
  signal?: AbortSignal,
): Promise<AuthorCandidate[]> {
  const data = await getJson<SearchAuthorsResponse>(
    `/api/authors/search?name=${encodeURIComponent(name)}`,
    signal,
  );
  return data.candidates;
}

export async function getAuthorPublications(
  name: string,
  affiliation?: string,
  signal?: AbortSignal,
): Promise<Publication[]> {
  const params = new URLSearchParams({ name });
  if (affiliation) params.set("affiliation", affiliation);
  const data = await getJson<AuthorPublicationsResponse>(
    `/api/authors/publications?${params.toString()}`,
    signal,
  );
  return data.publications;
}
```

(`getPublication` is DELETED — dead code.)

- [ ] **Step 2: `hooks.ts`** — thread signals, delete `usePublication` and the `publication` query key:

```ts
export function useAuthorSearch(name: string) {
  return useQuery({
    queryKey: queryKeys.authorSearch(name),
    queryFn: ({ signal }) => searchAuthors(name, signal),
    enabled: name.trim().length > 0,
  });
}

export function useAuthorPublications(name: string | null, affiliation?: string) {
  return useQuery({
    queryKey: queryKeys.authorPublications(name ?? "", affiliation),
    queryFn: ({ signal }) => getAuthorPublications(name!, affiliation, signal),
    enabled: !!name,
  });
}
```

- [ ] **Step 3: `client.test.ts`** — remove `getPublication` test; add: non-OK response with JSON body `{ error: "upstream_unavailable", message: "..." }` throws `ApiRequestError` with that `detail` and `message`; signal is forwarded to fetch (assert mock called with `{ signal }`).
- [ ] **Step 4: Sentinel label in UI.** `AuthorCandidate.affiliation` is now optional. Everywhere a candidate's affiliation is rendered (`landing.tsx`, `top-bar.tsx`), display `c.affiliation ?? "Unknown affiliation"`. Where a candidate is picked and passed to `startExplore` (`app.tsx` `onPick`, and the equivalent in `top-bar`), pass `affiliation: c.affiliation` straight through — it is `undefined` for the unknown bucket, which now correctly means "no affiliation filter" server-side. Search the whole web app for the literal string `"Unknown affiliation"` — after this task it must appear ONLY as a render-time fallback label, never as a value sent to the API or used in identity.
- [ ] **Step 5: `lib/author.ts`** — replace the local first-token/`lastName` logic with `surnameOf` from `@spool/shared` (keep any display-specific formatting that builds on it).
- [ ] **Step 6: Run** `npm test -w @spool/web` — all pass. Manually grep: `grep -rn "usePublication\|getPublication" apps/web/src` returns nothing.

---

### Task 6: Web graph — hover ref, structural deps, dead code, types, constants, single sort

**Depends on Task 5 (same app, avoid parallel edits to `app.tsx`).**

**Files:**
- Modify: `apps/web/src/graph/graph-view.tsx`, `apps/web/src/graph/build-graph.ts`, `apps/web/src/graph/build-graph.test.ts`, `apps/web/src/app.tsx`

- [ ] **Step 1: `graph-view.tsx` hover → ref.** Replace `const [hoverId, setHoverId] = useState<string | null>(null)` with `const hoverRef = useRef<string | null>(null)`; `onNodeHover` writes `hoverRef.current`; `paintNode` reads `hoverRef.current` and drops `hoverId` from its dep array. Hover repaint still happens because force-graph repaints on pointer interaction.
- [ ] **Step 2: Stabilize remaining `ForceGraph2D` props.** Hoist the inline lambdas (`onNodeHover`, `onNodeClick`, `onRenderFramePre`, `onRenderFramePost`, `onEngineStop`, `linkColor`, `linkWidth`, `linkLineDash`) into `useCallback`s with correct deps (most become `[]` or depend on stable refs/callbacks).
- [ ] **Step 3: Fix reheat effect deps.** The effect at ~lines 189–198 currently depends on `[ready, nodes.length, links.length]`; change to `[ready, graphData]` (the memoized object whose identity changes exactly when structure changes).
- [ ] **Step 4: Delete dead `dataRef`** (~lines 144–146).
- [ ] **Step 5: Type the force-graph surface.** `useRef<ForceGraphMethods<...>>` from `react-force-graph-2d` instead of `useRef<any>`; define a `SimLink` interface with `kind: BuiltLink["kind"]` and use it in the link registry and the four `(l: any)` accessors. If the library's generics fight the registry types, reduce `any` to the narrowest possible cast and note it — do not spend more than ~15 minutes fighting generics.
- [ ] **Step 6: Camera constants.** `const FIT_MS = 400; const FIT_PAD = 80; const FOCUS_ZOOM = 2; const FOCUS_MS = 500;` at module level, replacing the scattered literals (lines ~167, 173, 195, 443, 472).
- [ ] **Step 7: Single sort.** In `build-graph.ts` remove the internal `sort` (~line 60) and document on `buildCoauthorGraph`'s JSDoc: "`publications` must be sorted newest-first; the caller owns ordering so panel and graph stay aligned." In `app.tsx`, pass the existing `sorted` memo into `buildCoauthorGraph` instead of raw `publications`. Update `build-graph.test.ts` fixtures to pass pre-sorted input (assert the contract, don't re-add the sort).
- [ ] **Step 8: Run** `npm test -w @spool/web` — all pass.

---

### Task 7: Web hygiene — blur timer, error boundary, strict tsconfig

**Depends on Tasks 5 and 6 (strict fallout is fixed against final code).**

**Files:**
- Create: `apps/web/src/components/error-boundary.tsx`
- Modify: `apps/web/src/components/top-bar.tsx`, `apps/web/src/main.tsx`, `apps/web/tsconfig.app.json`, `apps/web/tsconfig.node.json`

- [ ] **Step 1: Blur timer cleanup in `top-bar.tsx`:**

```tsx
const BLUR_CLOSE_MS = 150;
const blurTimer = useRef<number | undefined>(undefined);
useEffect(() => () => window.clearTimeout(blurTimer.current), []);
// onBlur:
onBlur={() => {
  blurTimer.current = window.setTimeout(() => setOpen(false), BLUR_CLOSE_MS);
}}
```

- [ ] **Step 2: Error boundary.** Create `components/error-boundary.tsx`:

```tsx
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/** Last-resort catch for render-time throws (e.g. canvas code) — avoids a silent white screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" style={{ padding: "2rem", textAlign: "center" }}>
          Something went wrong. Reload the page to continue.
        </div>
      );
    }
    return this.props.children;
  }
}
```

Wrap `<App />` with it in `main.tsx` (inside `QueryClientProvider` is fine).

- [ ] **Step 3: Strict tsconfig.** Add `"extends": "../../tsconfig.base.json"` as the FIRST key of both `apps/web/tsconfig.app.json` and `apps/web/tsconfig.node.json`. Keep their existing `compilerOptions` (bundler moduleResolution, JSX, noEmit, lib, etc.) — they override the base where they collide; delete any option that becomes an exact duplicate of the base. Then run `npx tsc -b` in `apps/web` and fix EVERY strict error properly (no `!` sprinkled blindly — prefer real narrowing; `noUncheckedIndexedAccess` errors usually want explicit `?? fallback` or a length check).
- [ ] **Step 4: Run** `npm test -w @spool/web` AND `npx tsc -b apps/web` — both clean.

---

### Task 8: Tooling/root — one TS version, root ESLint, typecheck gates, Docker/Railway

**Depends on all previous tasks.**

**Files:**
- Create: `eslint.config.js` (repo root)
- Delete: `apps/web/eslint.config.js`
- Modify: root `package.json`, `apps/web/package.json`, `apps/server/package.json`, `shared/package.json`, `Dockerfile`, `railway.json`

- [ ] **Step 1: Pin TypeScript once.** Root `package.json` devDependencies: `"typescript": "~6.0.2"`. Remove `"typescript"` from `apps/web`, `apps/server`, and `shared` package.json files. (`erasableSyntaxOnly` in web requires ≥5.8, so 5.5 must go.)
- [ ] **Step 2: Root scripts.** Add to root `package.json`: `"typecheck": "npm run typecheck --workspaces --if-present"`, `"lint": "eslint ."`. Ensure `shared` has `"typecheck": "tsc --noEmit"` (server got its in Task 3; web's is `"typecheck": "tsc -b"` — add it).
- [ ] **Step 3: Root ESLint.** Move `apps/web/eslint.config.js` to the repo root, restructured as: shared TS-recommended block for all `**/*.{ts,tsx}`; a web block (`files: ["apps/web/**/*.{ts,tsx}"]`) carrying the react-hooks/react-refresh plugins + browser globals; a node block (`files: ["apps/server/**/*.ts", "shared/**/*.ts"]`) with node globals; global ignores for `dist`, `node_modules`, `coverage`. Move the eslint-related devDependencies (`@eslint/js`, `eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `typescript-eslint`) from `apps/web/package.json` to root. Update web's `"lint"` script to `eslint .` scoped fine as-is or delete it in favor of root.
- [ ] **Step 4: Dockerfile.** After `COPY . .`, change the build line to `RUN npm run typecheck && npm run build -w @spool/web` so type errors fail the deploy.
- [ ] **Step 5: `railway.json`.** Remove `startCommand` (Dockerfile CMD is the single source of truth); add `"healthcheckPath": "/api/health"` under `deploy`.
- [ ] **Step 6:** `npm install` at root (lockfile refresh), then `npm run typecheck`, `npm run lint`, `npm test` — all clean. Lint will surface findings in previously-unlinted server/shared code: fix mechanical ones (unused vars etc.); report anything judgment-heavy rather than refactoring.

---

### Task 9: Full verification (main session, not a subagent)

- [ ] `npm install` — clean
- [ ] `npm run typecheck` — zero errors, all three workspaces
- [ ] `npm run lint` — zero errors
- [ ] `npm test` — all three workspaces green
- [ ] `npm run build` — web production build succeeds
- [ ] `grep -rn "Unknown affiliation" apps shared --include="*.ts" --include="*.tsx"` — appears only as UI fallback label (+ its test)
- [ ] `grep -rn "samplePublications\|GraphNode\|GraphState\|usePublication" apps shared --include="*.ts" --include="*.tsx"` — nothing
- [ ] Smoke: `npm run dev:server` + `curl localhost:5174/api/health` → `{"status":"ok"}`
- [ ] Working tree left uncommitted; summarize for the user

---

## Self-review notes

- Spec coverage: all 4 Criticals (Tasks 1/3/5 sentinel; 7 strict web; 2/3/8 typecheck gates; 2/3 NCBI+rate limit), all 13 Warnings (timeout T2, stampede T2, sort T2, api_key T2, error handler T3, CORS T3, shutdown T3, hover T6, reheat deps T6, envelopes T1/3/5, error shapes T1/3/5, surname dup T1/3/5, eslint T8), and all Suggestions (dead code T5/T6/T1, abort signals T5, blur timer T7, error boundary T7, cache keys T2, name schema T3, stopNodes T4, parse `any` T4, error-path tests T3, health T3/T8, TS pin T8, private:true T1/T3, railway startCommand T8, double sort T6, camera constants T6, force-graph types T6).
- Deliberately NOT done: rendering `samplePublications` (dropped instead — simpler, audit offered both); deleting the `/api/publications/:pmid` server route (kept — tested, tiny, likely future use; only the dead web client side goes).
- Type consistency checked: `UpstreamError(upstreamStatus, operation)` used identically in Tasks 2/3; envelope names identical in Tasks 1/3/5; `surnameOf`/`normalizeAffiliation` signatures identical in Tasks 1/3/5.
