import { describe, it, expect } from "vitest";
import { buildCandidates, matchesQuery } from "../src/pubmed/candidates.js";
import type { Publication } from "@spool/shared";

function pub(pmid: string, authors: { name: string; affiliation?: string }[]): Publication {
  return { pmid, title: `T${pmid}`, journal: "J", year: 2020, authors, pubmedUrl: `u/${pmid}` };
}

describe("buildCandidates", () => {
  it("groups the searched author's papers by affiliation", () => {
    const pubs = [
      pub("1", [{ name: "Smith J", affiliation: "MIT" }, { name: "Doe A" }]),
      pub("2", [{ name: "Smith J", affiliation: "MIT" }]),
      pub("3", [{ name: "Smith J", affiliation: "Stanford" }]),
    ];
    const candidates = buildCandidates(pubs, "Smith J");

    expect(candidates.length).toBe(2);
    const mit = candidates.find((c) => c.affiliation === "MIT")!;
    expect(mit.paperCount).toBe(2);
  });

  it("buckets papers with no affiliation as affiliation: undefined", () => {
    const pubs = [pub("1", [{ name: "Smith J" }])];
    const candidates = buildCandidates(pubs, "Smith J");
    expect(candidates[0]!.affiliation).toBeUndefined();
  });

  it("sorts candidates by paperCount descending", () => {
    const pubs = [
      pub("1", [{ name: "Smith J", affiliation: "MIT" }]),
      pub("2", [{ name: "Smith J", affiliation: "Stanford" }]),
      pub("3", [{ name: "Smith J", affiliation: "Stanford" }]),
    ];
    const candidates = buildCandidates(pubs, "Smith J");
    expect(candidates[0]!.affiliation).toBe("Stanford");
  });
});

describe("matchesQuery", () => {
  it("returns false for any name when query is only whitespace (empty surname guard)", () => {
    expect(matchesQuery("Smith J", "   ")).toBe(false);
    expect(matchesQuery("Doe A", "   ")).toBe(false);
    expect(matchesQuery("", "   ")).toBe(false);
  });

  it("returns true when surname appears in name", () => {
    expect(matchesQuery("Smith J", "Smith J")).toBe(true);
    expect(matchesQuery("Smith AB", "Smith")).toBe(true);
  });

  it("returns false when surname does not appear in name", () => {
    expect(matchesQuery("Doe A", "Smith J")).toBe(false);
  });
});
