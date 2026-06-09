import { describe, it, expect } from "vitest";
import { authorId } from "./types.js";

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
