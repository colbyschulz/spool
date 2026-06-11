# spool — Design

**Date:** 2026-06-09
**Status:** Approved (pre-implementation)

## 1. Purpose

spool is a visual explorer for scholarly collaboration networks built on PubMed.
A user searches an author, disambiguates to the correct person, then explores their
collaboration network by expanding co-authors paper-by-paper in an interactive
force-directed graph.

## 2. Core flow

1. **Search** — user enters an author name.
2. **Disambiguate** — candidate people, grouped by affiliation with sample papers and
   counts, are presented; the user picks the right person.
3. **Seed** — the chosen author becomes the single starting node in the graph.
4. **Expand** — selecting a node opens a side panel listing that author's publications;
   clicking a publication adds that paper's co-authors as new connected author nodes.
   Expansion continues outward from any node.

Graph semantics: **nodes = authors**, **edges = co-authorship**. Publications are
surfaced contextually in the side panel, not rendered as graph nodes.

## 3. Architecture

A monorepo using npm workspaces, TypeScript throughout.

```
spool/
├── apps/
│   ├── web/      # Vite + React + TS  (UI, graph, TanStack Query)
│   └── server/   # Fastify + TS       (PubMed proxy + in-memory cache)
└── packages/
    └── shared/   # shared TS types (Author, Publication, GraphNode, …)
```

Data flow:

```
React + TanStack Query  →  Fastify proxy  →  (lru-cache TTL)  →  NCBI E-utilities
```

- The browser never calls NCBI directly; CORS, rate-limiting, and the API key are all
  handled server-side.
- An optional `NCBI_API_KEY` env var raises NCBI's rate limit from 3 → 10 req/s.
- `lru-cache` with generous TTLs (PubMed records are effectively immutable), trivially
  swappable for Redis later.

## 4. Backend (Fastify)

The backend uses `efetch` (PubMed XML), parsed with `fast-xml-parser` — it is the only
E-utilities call that returns author **affiliations** and full author lists, both of
which disambiguation and the detail panels require. `esearch` is used to resolve a name
query to PMIDs.

| Route | Purpose |
|---|---|
| `GET /api/authors/search?name=` | `esearch` author name → `efetch` records → cluster candidates by affiliation for the disambiguation picker (returns candidate identities + sample papers + counts) |
| `GET /api/authors/publications?name=&affiliation=` | Publications for the chosen author identity |
| `GET /api/publications/:pmid` | Publication detail: title, journal, year, abstract link, and full author list (this list is the co-author expansion source) |

- Each endpoint is validated with Fastify JSON schemas.
- Structured logging via the built-in pino integration.
- A single **PubMed client** module owns eutils fetch + XML parse + cache; routes only
  compose it (see §8).

## 5. Frontend (React)

- **Search bar** → calls `/authors/search`.
- **Disambiguation picker** → candidate people grouped by affiliation; selecting one
  seeds the graph with a single node.
- **Graph view** (`react-force-graph` 2D): nodes = authors, edges = co-authorship.
  Selecting a node opens the side panel. The graph is driven by a `graphData` state
  object; expansion is a state update, not imperative mutation.
- **Side panel**:
  - *Author detail* — name, affiliation, paper count, link out to PubMed.
  - *Publication list* — the selected author's publications.
  - *Publication detail* — clicking a publication shows title, journal, year, authors,
    abstract link, and adds its co-authors as new connected nodes.
- **Filters** — year range, plus a cap/threshold on co-authors added per paper (to tame
  very large author lists).
- **Save / share** — autosave the current graph to localStorage; a "copy link" action
  encodes graph state in the URL hash for later restoration.

## 6. Data model (shared types)

Defined once in `packages/shared` and used by both apps:

- `Author` — `{ name, affiliation?, paperCount? }`
- `AuthorCandidate` — `{ name, affiliation, paperCount, samplePublications: Publication[] }`
- `Publication` — `{ pmid, title, journal, year, authors: Author[], pubmedUrl }`
- `GraphNode` — `{ id, author: Author }`  (id keyed by normalized name + affiliation)
- `GraphLink` — `{ source, target, viaPmid }`
- `GraphState` — `{ nodes: GraphNode[], links: GraphLink[], seedId }`

## 7. Known limitation (MVP, by design)

The disambiguation picker applies to the **seed** author only. Downstream co-authors use
**name (+ affiliation when the record provides it)** as their identity — there is no
second disambiguation per expansion. This is an accepted MVP trade-off and is documented
in the UI.

## 8. Engineering principles

These are requirements, not aspirations, and form the bar for code review.

### Minimal `useEffect`

Effects are a last resort, never the default for data fetching or derived state.

- **All server state goes through TanStack Query** — zero `useEffect`-based fetching.
- **Derive, don't sync** — values computable from props/state (filtered nodes, degree
  counts, panel contents) are derived during render, not mirrored into state via effects.
- **Events over effects** — expansion, selection, and filtering happen in event handlers.
- **Declarative graph** — react-force-graph is driven by `graphData` state, so expansion
  is a state update rather than imperative effect-driven mutation.
- Effects are reserved for genuine "sync with an external system" cases only:
  localStorage autosave, URL-hash share state, and a resize observer — each implemented
  as a small single-purpose custom hook (e.g. `useLocalStorageSync`, `useUrlGraphState`),
  never inline ad-hoc effects.

### Smart abstraction / minimal duplication

- **One PubMed client** on the server (single module: eutils fetch + XML parse + cache);
  routes compose it, with no repeated fetch/parse logic.
- **Typed query hooks** on the client (`useAuthorSearch`, `useAuthorPublications`,
  `usePublication`) co-locating query keys + fetch logic — components never call `fetch`
  directly.
- **Shared types** in `packages/shared` are the single source of truth across web and
  server.
- Small reusable presentational components (panel, list rows) over copy-paste.

### Design tokens

- A `tokens` layer: SCSS variables exposed as CSS custom properties on `:root`
  (color, spacing, typography scale, radii, z-index).
- Component `*.module.scss` files consume tokens only — **no hardcoded colors or
  spacing**.
- Graph node/edge colors read from the same tokens (passed into react-force-graph's
  render config) so the canvas and DOM stay visually consistent.

## 9. Styling

- **SCSS modules** (`*.module.scss`) via the `sass` dev dependency (Vite supports them
  natively). Scoped per component; no global utility-class framework.

## 10. Testing

- **Vitest** across both apps, following TDD.
- **Backend**: Fastify `.inject()` route tests against **mocked NCBI responses**
  (fixtures of real `efetch` XML) — no live network in tests. XML parsing logic is unit
  tested directly.
- **Frontend**: React Testing Library for components; query hooks tested with a mocked
  API layer.

## 11. Tooling defaults

- **Package manager**: npm (workspaces).
- **Node**: v24 LTS (installed via nvm).
- **Language**: TypeScript everywhere.

## 12. Out of scope (MVP)

- Citation/reference graphs (collaboration only).
- Per-expansion author disambiguation (see §7).
- Authentication / multi-user accounts.
- A persistent database (in-memory cache only; localStorage for client persistence).
- Topic/keyword/PMID search entry (author-name entry only).
