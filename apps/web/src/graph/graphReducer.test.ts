import { describe, it, expect } from "vitest";
import { initGraph, addCoAuthors } from "./graphReducer.js";
import { authorId, type Author } from "@skein/shared";

const seed: Author = { name: "Smith J", affiliation: "MIT" };

describe("graphReducer", () => {
  it("initGraph creates a single seed node", () => {
    const g = initGraph(seed);
    expect(g.nodes.length).toBe(1);
    expect(g.seedId).toBe(authorId(seed));
    expect(g.links.length).toBe(0);
  });

  it("addCoAuthors adds new nodes and edges from a paper", () => {
    const g0 = initGraph(seed);
    const coAuthors: Author[] = [seed, { name: "Doe A" }, { name: "Roe B" }];
    const g1 = addCoAuthors(g0, authorId(seed), coAuthors, "12345");

    expect(g1.nodes.length).toBe(3); // seed + 2 new
    // edges connect seed to each NEW co-author (not seed->seed)
    expect(g1.links.length).toBe(2);
    expect(g1.links.every((l) => l.viaPmid === "12345")).toBe(true);
  });

  it("is idempotent: re-adding the same paper does not duplicate nodes or edges", () => {
    const g0 = initGraph(seed);
    const coAuthors: Author[] = [seed, { name: "Doe A" }];
    const g1 = addCoAuthors(g0, authorId(seed), coAuthors, "12345");
    const g2 = addCoAuthors(g1, authorId(seed), coAuthors, "12345");
    expect(g2.nodes.length).toBe(g1.nodes.length);
    expect(g2.links.length).toBe(g1.links.length);
  });
});
