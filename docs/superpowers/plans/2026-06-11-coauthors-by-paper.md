# Co-authors Grouped by Paper — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-step "pick a paper → see its co-authors" flow with a one-step view where selecting an author blooms all their co-authors at once, spatially clustered by paper; clicking any co-author makes them the new active author.

**Architecture:** A new pure function `buildCoauthorGraph` derives force-graph nodes/links from the path + publications (invisible paper-anchor nodes act as cluster centers). `use-explorer` drops its two-step `mode` machine for `shownPaperCount` + `highlightedPmid`. `GraphView` learns the `anchor` role (unpainted cluster centers + title captions + highlight). `PubsPanel` becomes the always-on detail panel with a "Load more" control; `CoauthorsPanel` is deleted.

**Tech Stack:** React 18, TypeScript, Vite, Vitest + @testing-library/react, react-force-graph-2d.

---

## File Structure

- **Create** `apps/web/src/graph/build-graph.ts` — pure derivation of nodes/links/candidate-lookup. One responsibility: turn data into graph shape. Unit-tested.
- **Create** `apps/web/src/graph/build-graph.test.ts` — tests for the above.
- **Create** `apps/web/src/graph/use-explorer.test.ts` — tests for the reworked hook.
- **Modify** `apps/web/src/graph/use-explorer.ts` — new state model.
- **Modify** `apps/web/src/graph/graph-view.tsx` — `anchor` role, captions, highlight, forces, types from build-graph.
- **Modify** `apps/web/src/components/pubs-panel.tsx` — highlight active row, "Load more".
- **Modify** `apps/web/src/components/app.tsx` — use `buildCoauthorGraph`, remove `mode`/CoauthorsPanel, wire highlight + load-more.
- **Delete** `apps/web/src/components/coauthors-panel.tsx` and `apps/web/src/components/coauthors-panel.module.scss`.

---

## Task 1: Rework `use-explorer` state model

**Files:**
- Modify: `apps/web/src/graph/use-explorer.ts`
- Test: `apps/web/src/graph/use-explorer.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/graph/use-explorer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useExplorer } from "./use-explorer.js";

const A = { name: "Alice A" };
const B = { name: "Bob B" };

describe("useExplorer", () => {
  it("starts a path at the searched author with default shownPaperCount", () => {
    const { result } = renderHook(() => useExplorer());
    act(() => result.current.startExplore(A));
    expect(result.current.path).toHaveLength(1);
    expect(result.current.frontier).toEqual(A);
    expect(result.current.shownPaperCount).toBe(10);
    expect(result.current.highlightedPmid).toBeNull();
  });

  it("loadMorePapers increments shownPaperCount by 10", () => {
    const { result } = renderHook(() => useExplorer());
    act(() => result.current.startExplore(A));
    act(() => result.current.loadMorePapers());
    expect(result.current.shownPaperCount).toBe(20);
  });

  it("highlightPaper sets and clears the highlighted pmid", () => {
    const { result } = renderHook(() => useExplorer());
    act(() => result.current.startExplore(A));
    act(() => result.current.highlightPaper("123"));
    expect(result.current.highlightedPmid).toBe("123");
    act(() => result.current.highlightPaper(null));
    expect(result.current.highlightedPmid).toBeNull();
  });

  it("selecting a co-author appends to the path and resets count + highlight", () => {
    const { result } = renderHook(() => useExplorer());
    act(() => result.current.startExplore(A));
    act(() => result.current.loadMorePapers());
    act(() => result.current.highlightPaper("123"));
    act(() =>
      result.current.selectCoauthor(B, {
        pmid: "1",
        title: "Paper",
        journal: "J",
        year: 2020,
      }),
    );
    expect(result.current.path).toHaveLength(2);
    expect(result.current.frontier).toEqual(B);
    expect(result.current.shownPaperCount).toBe(10);
    expect(result.current.highlightedPmid).toBeNull();
  });

  it("selecting an author already on the path rewinds to them", () => {
    const { result } = renderHook(() => useExplorer());
    act(() => result.current.startExplore(A));
    act(() => result.current.selectCoauthor(B, { pmid: "1", title: "P", journal: "J" }));
    act(() => result.current.selectCoauthor(A, { pmid: "2", title: "Q", journal: "J" }));
    expect(result.current.path).toHaveLength(1);
    expect(result.current.frontier).toEqual(A);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -w @spool/web -- use-explorer`
Expected: FAIL — `loadMorePapers`, `highlightPaper`, `shownPaperCount` do not exist yet.

- [ ] **Step 3: Replace the hook implementation**

Replace the entire contents of `apps/web/src/graph/use-explorer.ts` with:

```ts
import { useCallback, useMemo, useState } from "react";
import { authorId, type Author } from "@spool/shared";

/** One author on the collaboration path, plus the paper that led to them. */
export interface PathStep {
  author: Author;
  viaPmid: string | null;
  viaTitle: string | null;
  viaJournal: string | null;
  viaYear: number | null;
}

/** The linking paper for a co-author hop (omitted for the seed). */
export interface ViaPaper {
  pmid: string;
  title: string;
  journal: string;
  year?: number;
}

const PAGE = 10;

interface State {
  path: PathStep[];
  shownPaperCount: number;
  highlightedPmid: string | null;
}

const INITIAL: State = { path: [], shownPaperCount: PAGE, highlightedPmid: null };

/**
 * The guided-path exploration model: a single thread of authors.
 *   search → frontier blooms all co-authors clustered by paper → pick one → repeat
 * Picking an author already on the path rewinds to that point.
 */
export function useExplorer() {
  const [{ path, shownPaperCount, highlightedPmid }, setState] = useState<State>(INITIAL);

  const startExplore = useCallback((author: Author) => {
    setState({
      path: [{ author, viaPmid: null, viaTitle: null, viaJournal: null, viaYear: null }],
      shownPaperCount: PAGE,
      highlightedPmid: null,
    });
  }, []);

  const selectCoauthor = useCallback((author: Author, via: ViaPaper | null) => {
    const id = authorId(author);
    setState((s) => {
      const existing = s.path.findIndex((p) => authorId(p.author) === id);
      const path =
        existing >= 0
          ? s.path.slice(0, existing + 1) // rewind to an author already on the path
          : [
              ...s.path,
              {
                author,
                viaPmid: via?.pmid ?? null,
                viaTitle: via?.title ?? null,
                viaJournal: via?.journal ?? null,
                viaYear: via?.year ?? null,
              },
            ];
      return { path, shownPaperCount: PAGE, highlightedPmid: null };
    });
  }, []);

  const rewindTo = useCallback((index: number) => {
    setState((s) => ({
      path: s.path.slice(0, index + 1),
      shownPaperCount: PAGE,
      highlightedPmid: null,
    }));
  }, []);

  const clearPath = useCallback(() => {
    setState((s) => ({
      path: s.path.slice(0, 1),
      shownPaperCount: PAGE,
      highlightedPmid: null,
    }));
  }, []);

  const loadMorePapers = useCallback(() => {
    setState((s) => ({ ...s, shownPaperCount: s.shownPaperCount + PAGE }));
  }, []);

  const highlightPaper = useCallback((pmid: string | null) => {
    setState((s) => ({ ...s, highlightedPmid: pmid }));
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  const frontier = path.length ? path[path.length - 1]!.author : null;
  const pathIds = useMemo(() => path.map((p) => authorId(p.author)), [path]);

  return {
    path,
    shownPaperCount,
    highlightedPmid,
    frontier,
    pathIds,
    startExplore,
    selectCoauthor,
    rewindTo,
    clearPath,
    loadMorePapers,
    highlightPaper,
    reset,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -w @spool/web -- use-explorer`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/graph/use-explorer.ts apps/web/src/graph/use-explorer.test.ts
git commit -m "feat(web): rework explorer state for co-authors-by-paper"
```

---

## Task 2: `buildCoauthorGraph` pure derivation

**Files:**
- Create: `apps/web/src/graph/build-graph.ts`
- Test: `apps/web/src/graph/build-graph.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/graph/build-graph.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Publication } from "@spool/shared";
import { buildCoauthorGraph } from "./build-graph.js";
import type { PathStep } from "./use-explorer.js";

const frontier = { name: "Alice A" };
const seed: PathStep[] = [
  { author: frontier, viaPmid: null, viaTitle: null, viaJournal: null, viaYear: null },
];

function pub(pmid: string, year: number, authorNames: string[]): Publication {
  return {
    pmid,
    title: `Paper ${pmid}`,
    journal: "J",
    year,
    authors: authorNames.map((name) => ({ name })),
    pubmedUrl: `https://pubmed/${pmid}`,
  };
}

describe("buildCoauthorGraph", () => {
  it("returns empty graph for an empty path", () => {
    const g = buildCoauthorGraph([], [pub("1", 2020, ["Alice A", "Bob B"])], 10);
    expect(g.nodes).toHaveLength(0);
    expect(g.links).toHaveLength(0);
  });

  it("creates an anchor per shown paper and a candidate per qualifying co-author", () => {
    const g = buildCoauthorGraph(seed, [pub("1", 2020, ["Alice A", "Bob B", "Cara C"])], 10);
    expect(g.nodes.find((n) => n.role === "frontier")?.name).toBe("Alice A");
    expect(g.nodes.filter((n) => n.role === "anchor")).toHaveLength(1);
    expect(g.nodes.filter((n) => n.role === "candidate").map((n) => n.name).sort()).toEqual([
      "Bob B",
      "Cara C",
    ]);
    // frontier → anchor, anchor → each candidate
    expect(g.links.filter((l) => l.kind === "anchor")).toHaveLength(1);
    expect(g.links.filter((l) => l.kind === "candidate")).toHaveLength(2);
  });

  it("excludes the frontier and authors already on the path", () => {
    const path: PathStep[] = [
      seed[0]!,
      { author: { name: "Bob B" }, viaPmid: "1", viaTitle: "P", viaJournal: "J", viaYear: 2020 },
    ];
    // frontier is now Bob B; Alice A is on the path; Dave D is fresh
    const g = buildCoauthorGraph(path, [pub("9", 2021, ["Bob B", "Alice A", "Dave D"])], 10);
    const candidateNames = g.nodes.filter((n) => n.role === "candidate").map((n) => n.name);
    expect(candidateNames).toEqual(["Dave D"]);
  });

  it("duplicates a shared co-author once per paper (distinct nodes, same authorId)", () => {
    const g = buildCoauthorGraph(
      seed,
      [pub("1", 2021, ["Alice A", "Bob B"]), pub("2", 2020, ["Alice A", "Bob B"])],
      10,
    );
    const bobNodes = g.nodes.filter((n) => n.role === "candidate" && n.name === "Bob B");
    expect(bobNodes).toHaveLength(2);
    expect(new Set(bobNodes.map((n) => n.id)).size).toBe(2); // distinct ids
    expect(new Set(bobNodes.map((n) => n.authorId)).size).toBe(1); // same identity
  });

  it("respects shownPaperCount, newest first", () => {
    const g = buildCoauthorGraph(
      seed,
      [pub("1", 2019, ["Alice A", "Bob B"]), pub("2", 2023, ["Alice A", "Cara C"])],
      1,
    );
    const anchors = g.nodes.filter((n) => n.role === "anchor");
    expect(anchors).toHaveLength(1);
    expect(anchors[0]!.pmid).toBe("2"); // 2023 is newest
  });

  it("skips papers that have no qualifying co-authors", () => {
    const g = buildCoauthorGraph(seed, [pub("1", 2020, ["Alice A"])], 10);
    expect(g.nodes.filter((n) => n.role === "anchor")).toHaveLength(0);
  });

  it("maps each candidate node id to its author and linking paper", () => {
    const g = buildCoauthorGraph(seed, [pub("1", 2020, ["Alice A", "Bob B"])], 10);
    const bob = g.nodes.find((n) => n.role === "candidate")!;
    const entry = g.candidates.get(bob.id)!;
    expect(entry.author.name).toBe("Bob B");
    expect(entry.via.pmid).toBe("1");
    expect(entry.via.title).toBe("Paper 1");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -w @spool/web -- build-graph`
Expected: FAIL — module `./build-graph.js` not found.

- [ ] **Step 3: Implement the pure function**

Create `apps/web/src/graph/build-graph.ts`:

```ts
import { authorId, type Author, type Publication } from "@spool/shared";
import type { PathStep, ViaPaper } from "./use-explorer.js";

export type NodeRole = "frontier" | "path" | "candidate" | "anchor";

export interface BuiltNode {
  id: string;
  role: NodeRole;
  /** Author display name; empty string for anchor nodes. */
  name: string;
  /** Present on candidate nodes — the author identity to advance to. */
  authorId?: string;
  /** Present on candidate + anchor nodes — the paper they belong to. */
  pmid?: string;
  /** Present on anchor nodes — the paper title drawn as the cluster caption. */
  title?: string;
}

export interface BuiltLink {
  source: string;
  target: string;
  kind: "path" | "anchor" | "candidate";
}

export interface BuiltGraph {
  nodes: BuiltNode[];
  links: BuiltLink[];
  /** candidate node id → the author it represents and the paper that links it. */
  candidates: Map<string, { author: Author; via: ViaPaper }>;
}

const byYearDesc = (a: Publication, b: Publication) => (b.year ?? 0) - (a.year ?? 0);

/**
 * Derive the force-graph shape: the path thread plus, around the frontier, one
 * invisible anchor per shown paper with that paper's co-authors hanging off it.
 */
export function buildCoauthorGraph(
  path: PathStep[],
  publications: Publication[],
  shownPaperCount: number,
): BuiltGraph {
  const nodes: BuiltNode[] = [];
  const links: BuiltLink[] = [];
  const candidates = new Map<string, { author: Author; via: ViaPaper }>();

  if (path.length === 0) return { nodes, links, candidates };

  const pathIds = path.map((p) => authorId(p.author));
  const frontierId = pathIds[pathIds.length - 1]!;

  // Path thread: a node per author, links between consecutive authors.
  path.forEach((step, i) => {
    const id = pathIds[i]!;
    nodes.push({ id, role: id === frontierId ? "frontier" : "path", name: step.author.name });
    if (i > 0) links.push({ source: pathIds[i - 1]!, target: id, kind: "path" });
  });

  const shown = [...publications].sort(byYearDesc).slice(0, shownPaperCount);

  for (const p of shown) {
    const fresh = p.authors.filter((a) => {
      const id = authorId(a);
      return id !== frontierId && !pathIds.includes(id);
    });
    if (fresh.length === 0) continue; // co-author-less paper → no cluster

    const anchorId = "anchor:" + p.pmid;
    nodes.push({ id: anchorId, role: "anchor", name: "", pmid: p.pmid, title: p.title });
    links.push({ source: frontierId, target: anchorId, kind: "anchor" });

    const via: ViaPaper = { pmid: p.pmid, title: p.title, journal: p.journal, year: p.year };
    const seen = new Set<string>();
    for (const a of fresh) {
      const aid = authorId(a);
      if (seen.has(aid)) continue; // same author listed twice on one paper
      seen.add(aid);
      const nodeId = aid + "__" + p.pmid;
      nodes.push({ id: nodeId, role: "candidate", name: a.name, authorId: aid, pmid: p.pmid });
      links.push({ source: anchorId, target: nodeId, kind: "candidate" });
      candidates.set(nodeId, { author: a, via });
    }
  }

  return { nodes, links, candidates };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -w @spool/web -- build-graph`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/graph/build-graph.ts apps/web/src/graph/build-graph.test.ts
git commit -m "feat(web): pure co-author-by-paper graph derivation"
```

---

## Task 3: Teach `GraphView` the anchor role, captions, highlight, forces

**Files:**
- Modify: `apps/web/src/graph/graph-view.tsx`

This component is canvas-rendered and not unit-tested; verify by build + manual run.

- [ ] **Step 1: Replace the type definitions and Props**

In `apps/web/src/graph/graph-view.tsx`, replace the top type block (the `export type NodeRole`, `GraphNodeView`, `GraphLinkView`, and `Props` declarations) with:

```ts
import type { BuiltNode, BuiltLink } from "./build-graph.js";

export type { BuiltNode, BuiltLink };

interface Props {
  nodes: BuiltNode[];
  links: BuiltLink[];
  /** Ordered author ids from seed → frontier; drives the glowing thread. */
  pathIds: string[];
  /** Linking-paper title per segment: pathLabels[i] joins pathIds[i] → pathIds[i+1]. */
  pathLabels: (string | null)[];
  /** Paper whose cluster is emphasized + centered; null = none. */
  highlightedPmid: string | null;
  frontierName: string | null;
  onSelectCandidate: (id: string) => void;
  onSelectPath: (id: string) => void;
}
```

Update the `SimNode` interface to extend `BuiltNode`:

```ts
interface SimNode extends BuiltNode {
  x?: number;
  y?: number;
}
```

- [ ] **Step 2: Update the destructured props and add a highlight color**

Change the `GraphView` function signature destructuring to use `highlightedPmid` instead of `mode`:

```ts
export function GraphView({
  nodes,
  links,
  pathIds,
  pathLabels,
  highlightedPmid,
  frontierName,
  onSelectCandidate,
  onSelectPath,
}: Props) {
```

Add a `dim` alpha constant near the `COLORS` object (after the closing `};` of `COLORS`):

```ts
const DIM_ALPHA = 0.18;
```

- [ ] **Step 3: Keep a ref to the highlighted pmid and center on change**

After the existing `pathLabelsRef` block, add:

```ts
const highlightRef = useRef(highlightedPmid);
highlightRef.current = highlightedPmid;

// Center + zoom on the highlighted paper's cluster anchor when it changes.
useEffect(() => {
  if (!highlightedPmid) return;
  const fg = fgRef.current;
  const anchor = nodeReg.current.get("anchor:" + highlightedPmid);
  if (fg && anchor && anchor.x != null && anchor.y != null) {
    fg.centerAt(anchor.x, anchor.y, 500);
    fg.zoom(2, 500);
  }
}, [highlightedPmid]);
```

- [ ] **Step 4: Update the force tuning to separate by link kind**

Replace the body of the layout `useEffect` (the one calling `d3Force("charge")`) with:

```ts
useEffect(() => {
  const fg = fgRef.current;
  if (!fg) return;
  fg.d3Force("charge")?.strength(-1300);
  fg.d3Force("link")?.distance((l: any) =>
    l.kind === "path" ? 170 : l.kind === "anchor" ? 150 : 60,
  );
}, []);
```

- [ ] **Step 5: Skip anchors in paint, and dim non-highlighted clusters**

At the very top of `paintNode` (before reading `role`), add an early return for anchors and compute a dim factor:

```ts
const paintNode = useCallback(
  (node: SimNode, ctx: CanvasRenderingContext2D, scale: number) => {
    if (node.role === "anchor") return; // anchors are invisible cluster centers
    const hl = highlightRef.current;
    const dimmed = hl != null && node.role === "candidate" && node.pmid !== hl;
    ctx.save();
    if (dimmed) ctx.globalAlpha = DIM_ALPHA;

    const { role } = node;
    // ... existing body unchanged ...

    ctx.restore();
  },
  [hoverId],
);
```

Keep the entire existing body of `paintNode` between the `const { role } = node;` line and the new `ctx.restore();`. (The `ctx.save()`/`ctx.restore()` wrap ensures the dim alpha never leaks to other nodes.)

- [ ] **Step 6: Make anchors non-interactive**

Replace `paintPointerArea` so anchor nodes get no clickable area:

```ts
const paintPointerArea = useCallback(
  (node: SimNode, color: string, ctx: CanvasRenderingContext2D) => {
    if (node.role === "anchor") return; // not hoverable / clickable
    ctx.beginPath();
    ctx.arc(node.x ?? 0, node.y ?? 0, NODE_R, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  },
  [],
);
```

And guard the click handler so anchors are ignored — replace the `onNodeClick` handler:

```ts
onNodeClick={(n: SimNode) => {
  if (n.role === "anchor") return;
  if (n.role === "candidate") onSelectCandidate(n.id);
  else onSelectPath(n.id);
}}
```

- [ ] **Step 7: Draw paper-title captions at anchor positions**

Add a caption renderer near `drawThreadLabels` (reusing the same pill style):

```ts
const drawPaperCaptions = useCallback((ctx: CanvasRenderingContext2D, scale: number) => {
  const reg = nodeReg.current;
  const hl = highlightRef.current;
  const fontSize = Math.max(11, 10 / scale);
  const padX = 6 / scale;
  const padY = 4 / scale;

  ctx.save();
  ctx.font = `600 ${fontSize}px Roboto, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const n of reg.values()) {
    if (n.role !== "anchor" || n.x == null || n.y == null || !n.title) continue;
    const faded = hl != null && n.pmid !== hl;
    const text = truncate(n.title);
    const w = ctx.measureText(text).width + padX * 2;
    const h = fontSize + padY * 2;

    ctx.globalAlpha = faded ? DIM_ALPHA : 0.95;
    ctx.fillStyle = COLORS.canvas;
    ctx.beginPath();
    ctx.roundRect(n.x - w / 2, n.y - h / 2, w, h, 4 / scale);
    ctx.fill();
    ctx.strokeStyle = n.pmid === hl ? COLORS.candBorderHover : COLORS.candBorder;
    ctx.lineWidth = 1 / scale;
    ctx.stroke();

    ctx.globalAlpha = faded ? DIM_ALPHA : 1;
    ctx.fillStyle = COLORS.label;
    ctx.fillText(text, n.x, n.y);
  }
  ctx.restore();
}, []);
```

Then call it from the post-render pass — replace the `onRenderFramePost` prop:

```ts
onRenderFramePost={(ctx: CanvasRenderingContext2D, scale: number) => {
  drawPaperCaptions(ctx, scale);
  drawThreadLabels(ctx, scale);
}}
```

- [ ] **Step 8: Make anchor links invisible, candidate links dashed**

The existing `linkColor`/`linkWidth`/`linkLineDash` already render only `candidate` links. Anchor and path links fall through to transparent/zero, which is correct — leave them. Confirm the three link props read:

```ts
linkColor={(l: any) => (l.kind === "candidate" ? COLORS.candidateEdge : "rgba(0,0,0,0)")}
linkWidth={(l: any) => (l.kind === "candidate" ? 1.5 : 0)}
linkLineDash={(l: any) => (l.kind === "candidate" ? [2, 5] : null)}
```

- [ ] **Step 9: Update the empty/hint text**

Replace the `mode === "pubs" && frontierName && (...)` hint block with a frontier-based hint:

```tsx
{frontierName && nodes.every((n) => n.role !== "candidate") && (
  <div className={styles.hint}>
    No co-authors found for {lastName(frontierName)}’s recent papers
  </div>
)}
```

And update the legend's middle item label from "Co-author (selectable)" to "Co-author — click to follow".

- [ ] **Step 10: Build to verify types compile**

Run: `npm run build -w @spool/web`
Expected: Vite build succeeds (tsc + bundle), no type errors. (Will fail until Task 5 updates `app.tsx` callers — if so, proceed to Task 4/5 and build at the end of Task 5.)

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/graph/graph-view.tsx
git commit -m "feat(web): anchor clusters, captions, and highlight in GraphView"
```

---

## Task 4: `PubsPanel` — highlight active row + "Load more"

**Files:**
- Modify: `apps/web/src/components/pubs-panel.tsx`
- Modify: `apps/web/src/components/pubs-panel.module.scss`

- [ ] **Step 1: Update the Props and handlers**

In `apps/web/src/components/pubs-panel.tsx`, replace the `Props` interface and the destructure with renamed callbacks plus load-more inputs:

```ts
interface Props {
  author: Author;
  publications: Publication[];
  loading: boolean;
  error: boolean;
  highlightedPmid: string | null;
  depth: number;
  hasMore: boolean;
  onHighlightPaper: (pmid: string) => void;
  onLoadMore: () => void;
}

export function PubsPanel({
  author,
  publications,
  loading,
  error,
  highlightedPmid,
  depth,
  hasMore,
  onHighlightPaper,
  onLoadMore,
}: Props) {
```

> Note: `publications` here is already the shown slice (see Task 5) and is already newest-first, so remove the local `papers` re-sort and use `publications` directly. The `stats` block stays as-is.

Replace the `papers` memo usage: change `const papers = useMemo(...)` to `const papers = publications;` and keep the rest of the stats logic referencing `publications`.

- [ ] **Step 2: Wire the card click + selected state to highlight**

In the `papers.map(...)` block, change the card to use `highlightedPmid` and `onHighlightPaper`:

```tsx
{papers.map((p) => (
  <PubMedCard
    key={p.pmid}
    paper={p}
    selected={p.pmid === highlightedPmid}
    onClick={() => onHighlightPaper(p.pmid)}
  />
))}
```

- [ ] **Step 3: Add the "Load more" button**

Immediately after the `papers.map(...)` block and before the closing `</div>` of `styles.list`, add:

```tsx
{hasMore && (
  <button className={styles.loadMore} onClick={onLoadMore}>
    Load more papers
  </button>
)}
```

- [ ] **Step 4: Add the button style**

Append to `apps/web/src/components/pubs-panel.module.scss`:

```scss
.loadMore {
  margin-top: $space-3;
  width: 100%;
  padding: 9px 12px;
  border: 1px solid $color-border-strong;
  border-radius: $radius-md;
  background: $color-surface;
  font-family: $font-body;
  font-size: $text-sm;
  color: $color-text-2;
  cursor: pointer;

  &:hover { background: $color-accent-subtle; color: $color-text; }
}
```

- [ ] **Step 5: Build to verify (deferred)**

`PubsPanel` callers change in Task 5; type-check happens there. No standalone command.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/pubs-panel.tsx apps/web/src/components/pubs-panel.module.scss
git commit -m "feat(web): PubsPanel highlights clusters and loads more papers"
```

---

## Task 5: Rewire `app.tsx`, delete `CoauthorsPanel`, verify end-to-end

**Files:**
- Modify: `apps/web/src/components/app.tsx`
- Delete: `apps/web/src/components/coauthors-panel.tsx`
- Delete: `apps/web/src/components/coauthors-panel.module.scss`

- [ ] **Step 1: Delete the obsolete co-authors panel**

```bash
git rm apps/web/src/components/coauthors-panel.tsx apps/web/src/components/coauthors-panel.module.scss
```

- [ ] **Step 2: Replace `app.tsx` with the single-step flow**

Replace the entire contents of `apps/web/src/components/app.tsx` with:

```tsx
import { useCallback, useMemo, useState } from "react";
import type { AuthorCandidate, Publication } from "@spool/shared";
import { Landing } from "./landing.js";
import { TopBar } from "./top-bar.js";
import { ThreadBar } from "./thread-bar.js";
import { PubsPanel } from "./pubs-panel.js";
import { GraphView } from "../graph/graph-view.js";
import { buildCoauthorGraph } from "../graph/build-graph.js";
import { useExplorer } from "../graph/use-explorer.js";
import { useAuthorPublications } from "../api/hooks.js";
import styles from "./app.module.scss";

const byYearDesc = (a: Publication, b: Publication) => (b.year ?? 0) - (a.year ?? 0);

export function App() {
  const [phase, setPhase] = useState<"landing" | "explorer">("landing");
  const {
    path,
    shownPaperCount,
    highlightedPmid,
    frontier,
    pathIds,
    startExplore,
    selectCoauthor,
    rewindTo,
    clearPath,
    loadMorePapers,
    highlightPaper,
    reset,
  } = useExplorer();

  const pubs = useAuthorPublications(frontier?.name ?? null, frontier?.affiliation);
  const publications = pubs.data ?? [];

  // Newest-first, then the slice currently shown as panel rows + graph clusters.
  const sorted = useMemo(() => [...publications].sort(byYearDesc), [publications]);
  const shownPubs = useMemo(() => sorted.slice(0, shownPaperCount), [sorted, shownPaperCount]);

  const graph = useMemo(
    () => buildCoauthorGraph(path, publications, shownPaperCount),
    [path, publications, shownPaperCount],
  );

  // Linking-paper title per consecutive path pair (path[i+1].viaTitle).
  const pathLabels = useMemo(() => path.slice(1).map((s) => s.viaTitle), [path]);

  const onPick = useCallback(
    (c: AuthorCandidate) => {
      startExplore({ name: c.name, affiliation: c.affiliation });
      setPhase("explorer");
    },
    [startExplore],
  );

  const onSelectCandidateNode = useCallback(
    (id: string) => {
      const hit = graph.candidates.get(id);
      if (hit) selectCoauthor(hit.author, hit.via);
    },
    [graph, selectCoauthor],
  );

  const onSelectPathNode = useCallback(
    (id: string) => {
      const index = pathIds.indexOf(id);
      if (index >= 0) rewindTo(index);
    },
    [pathIds, rewindTo],
  );

  if (phase === "landing" || !frontier) {
    return <Landing onPick={onPick} />;
  }

  return (
    <div className={styles.app}>
      <TopBar
        onHome={() => {
          reset();
          setPhase("landing");
        }}
        onJump={onPick}
        pathLen={path.length}
      />
      <ThreadBar
        path={path}
        frontierId={frontier ? pathIds[pathIds.length - 1]! : null}
        onSelectAuthor={rewindTo}
        onClear={clearPath}
      />
      <div className={styles.body}>
        <PubsPanel
          author={frontier}
          publications={shownPubs}
          loading={pubs.isLoading}
          error={pubs.isError}
          highlightedPmid={highlightedPmid}
          depth={path.length - 1}
          hasMore={sorted.length > shownPaperCount}
          onHighlightPaper={highlightPaper}
          onLoadMore={loadMorePapers}
        />
        <div className={styles.canvas}>
          <GraphView
            nodes={graph.nodes}
            links={graph.links}
            pathIds={pathIds}
            pathLabels={pathLabels}
            highlightedPmid={highlightedPmid}
            frontierName={frontier.name}
            onSelectCandidate={onSelectCandidateNode}
            onSelectPath={onSelectPathNode}
          />
        </div>
      </div>
    </div>
  );
}
```

> Note on `ThreadBar`: it previously received `frontierId={frontier ? authorId(frontier) : null}`. The equivalent here is the last `pathIds` entry. If `ThreadBar` imports remain unaffected, no change to that file is needed.

- [ ] **Step 3: Run the full web test suite**

Run: `npm run test -w @spool/web`
Expected: PASS — `use-explorer` (5), `build-graph` (7), `app.test.tsx` (1, renders the search bar), `api/client.test.ts` unchanged.

- [ ] **Step 4: Type-check and build**

Run: `npm run build -w @spool/web`
Expected: `tsc -b && vite build` succeeds with no type errors and no remaining references to `coauthors-panel`, `mode`, `selectPub`, or `selectedPmid`.

- [ ] **Step 5: Grep for dangling references**

Run: `grep -rn "coauthors-panel\|CoauthorsPanel\|selectPub\|selectedPmid\|backToPubs" apps/web/src`
Expected: no matches.

- [ ] **Step 6: Manual verification**

Run: `npm run dev:web` (and `npm run dev:server` in another shell). In the browser:
- Search an author and select them → their recent papers' co-authors appear as clusters, each captioned with a paper title.
- Click a paper row in the left panel → that cluster brightens and the canvas centers/zooms on it; others dim.
- Click "Load more papers" → more clusters + rows appear.
- Click a co-author node → they become the new active author and their clusters bloom; the thread shows the hop.
- Click an earlier author in the thread bar → rewinds.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/app.tsx
git commit -m "feat(web): single-step co-authors-by-paper exploration flow"
```

---

## Self-Review Notes

- **Spec coverage:** state model (Task 1), invisible anchors + duplication + exclusion + shownPaperCount + skip-empty (Task 2), captions + highlight + non-interactive anchors + forces (Task 3), panel detail + Load more (Task 4), delete CoauthorsPanel + remove `mode` + wiring (Task 5). All spec sections map to a task.
- **Type consistency:** `BuiltNode`/`BuiltLink` defined in Task 2 are imported by `GraphView` (Task 3) and produced for it in `app.tsx` (Task 5). `buildCoauthorGraph(path, publications, shownPaperCount)` signature is identical across Tasks 2 and 5. `highlightPaper`, `loadMorePapers`, `shownPaperCount`, `highlightedPmid` names are identical across Tasks 1, 4, 5.
- **No placeholders:** every code step shows complete code.
```
