import { describe, it, expect } from "vitest";
import type { Author, Publication } from "@spool/shared";
import { buildCoauthorGraph, byYearDesc } from "./build-graph.js";
import type { PathStep } from "./use-explorer.js";

const frontier: Author = { name: "Alice A" };
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

// buildCoauthorGraph's contract: the caller passes publications pre-sorted
// newest-first. Fixtures go through this helper to honor it explicitly.
function newestFirst(...pubs: Publication[]): Publication[] {
  return [...pubs].sort(byYearDesc);
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
    expect(g.links.filter((l) => l.kind === "anchor")).toHaveLength(1);
    expect(g.links.filter((l) => l.kind === "candidate")).toHaveLength(2);
  });

  it("excludes the frontier and authors already on the path", () => {
    const path: PathStep[] = [
      seed[0]!,
      { author: { name: "Bob B" }, viaPmid: "1", viaTitle: "P", viaJournal: "J", viaYear: 2020 },
    ];
    const g = buildCoauthorGraph(path, [pub("9", 2021, ["Bob B", "Alice A", "Dave D"])], 10);
    const candidateNames = g.nodes.filter((n) => n.role === "candidate").map((n) => n.name);
    expect(candidateNames).toEqual(["Dave D"]);
  });

  it("duplicates a shared co-author once per paper (distinct nodes, same authorId)", () => {
    const g = buildCoauthorGraph(
      seed,
      newestFirst(pub("1", 2021, ["Alice A", "Bob B"]), pub("2", 2020, ["Alice A", "Bob B"])),
      10,
    );
    const bobNodes = g.nodes.filter((n) => n.role === "candidate" && n.name === "Bob B");
    expect(bobNodes).toHaveLength(2);
    expect(new Set(bobNodes.map((n) => n.id)).size).toBe(2);
    expect(new Set(bobNodes.map((n) => n.authorId)).size).toBe(1);
  });

  it("respects shownPaperCount against the caller's newest-first order", () => {
    const g = buildCoauthorGraph(
      seed,
      newestFirst(pub("1", 2019, ["Alice A", "Bob B"]), pub("2", 2023, ["Alice A", "Cara C"])),
      1,
    );
    const anchors = g.nodes.filter((n) => n.role === "anchor");
    expect(anchors).toHaveLength(1);
    expect(anchors[0]!.pmid).toBe("2");
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

  it("returns only the path thread when shownPaperCount is 0", () => {
    const g = buildCoauthorGraph(seed, [pub("1", 2020, ["Alice A", "Bob B"])], 0);
    expect(g.nodes.filter((n) => n.role === "anchor")).toHaveLength(0);
    expect(g.nodes.filter((n) => n.role === "path" || n.role === "frontier")).toHaveLength(1);
  });
});
