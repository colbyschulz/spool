# Co-authors grouped by paper — Design

## Goal

Change the core exploration interaction from two steps to one. Today: select an
author → list their papers → click one paper → that paper's co-authors appear →
pick one to advance. New: select an author → **all** of their co-authors appear at
once in the graph, spatially clustered by paper → pick any co-author to make them
the new active author, whose co-authors then bloom the same way.

The data already supports this: `useAuthorPublications` returns every publication
with its full author list, so no backend change is needed. This is a UI /
interaction change.

## Decisions

- **Grouping visual:** co-authors are spatially clustered by paper. Each cluster is
  captioned with its paper title. There are no visible "paper" nodes.
- **Duplication:** a co-author who appears on multiple shown papers appears once in
  each of those clusters (distinct nodes sharing the same author identity).
- **Scale:** show the most-recent ~10 papers as clusters, newest-first, with a
  "Load more" control. Bounds the canvas for prolific authors.
- **Left panel:** active-author detail + stats + publications list. Clicking a paper
  highlights (and centers) its cluster. The separate per-paper co-authors panel and
  the two-step "open a paper" mode are removed.
- **Thread:** clusters bloom from the **frontier** (current active author). The
  breadcrumb/thread of prior authors stays visible. Picking a co-author appends it
  as the new frontier and re-blooms clusters from there.
- **Clustering mechanism:** invisible paper-anchor nodes in the force simulation
  (one per shown paper) act as cluster centers; co-authors link to their paper's
  anchor. Anchors are not painted and not clickable.

## Architecture

### State model — `apps/web/src/graph/use-explorer.ts`

Replace the `mode` / `selectedPmid` two-step machine with:

```ts
interface State {
  path: PathStep[];
  shownPaperCount: number;     // default 10
  highlightedPmid: string | null;
}
```

- Remove `mode`, `selectedPmid`, `selectPub`, `backToPubs`.
- Add `loadMorePapers()` — increments `shownPaperCount` by 10.
- Add `highlightPaper(pmid: string | null)` — sets/clears `highlightedPmid`.
- `startExplore`, `rewindTo`, `clearPath`, `reset` keep their behavior, and every
  frontier-changing action resets `shownPaperCount` to 10 and clears
  `highlightedPmid`.
- `selectCoauthor(author, via)` keeps its dedupe/rewind semantics; `via` is the
  paper of the cluster the clicked node belongs to.

### Graph data derivation — `apps/web/src/components/app.tsx`

Sort the frontier's publications newest-first (by year descending, the same order
`PubsPanel` uses) and take the first `shownPaperCount`. For each such paper `P`:

- Add an anchor node: `{ id: "anchor:" + P.pmid, role: "anchor", pmid: P.pmid, title: P.title }`.
- Add a link `frontier → anchor` (`kind: "anchor"`).
- For each co-author `A` on `P` where `authorId(A)` is neither the frontier nor on
  the path: add `{ id: authorId(A) + "__" + P.pmid, role: "candidate", name: A.name, authorId: authorId(A), pmid: P.pmid }`
  and a link `anchor → co-author` (`kind: "candidate"`).
- A paper with no qualifying co-authors is skipped on the canvas (still listed in
  the panel).
- Prior path authors and the consecutive path links render exactly as today; the
  glowing thread is unchanged.

### Rendering — `apps/web/src/graph/graph-view.tsx`

- `NodeRole` gains `"anchor"`. Anchor nodes are skipped in `paintNode` and have no
  pointer area (not hoverable/clickable); they only shape the layout.
- Forces: frontier→anchor link distance is larger (spreads papers apart);
  anchor→co-author distance is small (tight clusters). Charge tuned so clusters
  separate cleanly.
- Each anchor's paper title is drawn as a caption pill at the anchor's position,
  reusing the existing thread-label pill renderer (truncated).
- Highlight: when `highlightedPmid` is set, brighten that cluster's co-author nodes,
  dim the others, and `centerAt`/`zoom` to the anchor.
- Co-author click → `onSelectCandidate` → `selectCoauthor(author, { pmid, title, journal, year })`.
  Path-node click → `onSelectPath` → rewind, as today.
- Hint/legend updated: drop "open a publication"; add a "pick a co-author to follow
  the thread" hint.

### Panel — `apps/web/src/components/pubs-panel.tsx` / `app.tsx`

- Delete `coauthors-panel.tsx` and the `mode` branch in `app.tsx`.
- `PubsPanel` is the always-on left panel: active-author identity + stats + the
  **currently shown** publications (the most-recent `shownPaperCount`, newest-first)
  — panel rows always equal the graph's clusters. Clicking a paper calls
  `highlightPaper(pmid)` to highlight and center its cluster (which always exists,
  since rows == clusters). A "Load more" button — shown when the author has more
  publications than `shownPaperCount` — calls `loadMorePapers()` to reveal the next
  batch as both panel rows and graph clusters.

## Edge cases

- Co-author already on the path: excluded from clusters (matches current behavior).
- A paper with no other authors: skipped on the canvas, still listed in the panel.
- Loading / error: spinner in the panel, empty canvas with hint — as today.
- Canvas density is bounded by `shownPaperCount`; "Load more" expands deliberately.

## Testing

- **`use-explorer` unit tests:** `loadMorePapers` increments; `highlightPaper`
  sets/clears; a frontier change resets `shownPaperCount` to 10 and clears the
  highlight; `selectCoauthor` dedupe/rewind unchanged.
- **Graph-derivation tests** (pure function extracted from `app.tsx` if helpful):
  from a publications fixture it builds the correct anchors, co-author nodes, and
  links; duplicates a shared co-author once per paper; excludes path members;
  respects `shownPaperCount`; skips co-author-less papers.
- **Existing `app.test.tsx`** (renders the search bar) stays green.
- Canvas painting is verified manually (not unit-tested).

## Out of scope

- No backend / API changes.
- No new persistence of exploration state.
- Cluster collision/label-overlap polish beyond truncation is best-effort, not a
  hard requirement.
