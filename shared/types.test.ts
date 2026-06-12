import { describe, it, expect } from "vitest";
import { authorId, surnameOf, normalizeAffiliation } from "./types.js";

describe("authorId", () => {
  it("normalizes case and whitespace", () => {
    expect(authorId({ name: "  Jane   Smith " })).toBe("jane smith");
  });

  it("includes affiliation when present", () => {
    expect(authorId({ name: "Jane Smith", affiliation: "MIT" })).toBe("jane smith|mit");
  });

  it("treats same name with different affiliation as distinct ids", () => {
    const a = authorId({ name: "Jane Smith", affiliation: "MIT" });
    const b = authorId({ name: "Jane Smith", affiliation: "Stanford" });
    expect(a).not.toBe(b);
  });
});

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
