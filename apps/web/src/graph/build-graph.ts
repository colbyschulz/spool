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

export const byYearDesc = (a: Publication, b: Publication) => (b.year ?? 0) - (a.year ?? 0);

/**
 * Derive the force-graph shape: the path thread plus, around the frontier, one
 * invisible anchor per shown paper with that paper's co-authors hanging off it.
 *
 * `publications` MUST already be sorted newest-first (see {@link byYearDesc});
 * `shownPaperCount` slices from the front of that order. The caller owns the
 * ordering so panel rows and graph clusters stay aligned by construction —
 * sort once, share the result.
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
  const frontierId = pathIds.at(-1)!; // safe: early-return above guarantees length >= 1
  const pathIdSet = new Set(pathIds);

  // Path thread: a node per author, links between consecutive authors.
  path.forEach((step, i) => {
    const id = pathIds[i]!;
    nodes.push({ id, role: id === frontierId ? "frontier" : "path", name: step.author.name });
    if (i > 0) links.push({ source: pathIds[i - 1]!, target: id, kind: "path" });
  });

  const shown = publications.slice(0, shownPaperCount);

  for (const p of shown) {
    const fresh = p.authors.filter((a) => !pathIdSet.has(authorId(a)));
    if (fresh.length === 0) continue; // all co-authors already on path → no cluster

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
