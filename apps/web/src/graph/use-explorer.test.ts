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

  it("rewindTo slices the path to the given index and resets view state", () => {
    const { result } = renderHook(() => useExplorer());
    act(() => result.current.startExplore(A));
    act(() => result.current.selectCoauthor(B, { pmid: "1", title: "P", journal: "J" }));
    act(() => result.current.loadMorePapers());
    act(() => result.current.highlightPaper("9"));
    act(() => result.current.rewindTo(0));
    expect(result.current.path).toHaveLength(1);
    expect(result.current.frontier).toEqual(A);
    expect(result.current.shownPaperCount).toBe(10);
    expect(result.current.highlightedPmid).toBeNull();
  });

  it("clearPath keeps only the seed author and resets view state", () => {
    const { result } = renderHook(() => useExplorer());
    act(() => result.current.startExplore(A));
    act(() => result.current.selectCoauthor(B, { pmid: "1", title: "P", journal: "J" }));
    act(() => result.current.loadMorePapers());
    act(() => result.current.clearPath());
    expect(result.current.path).toHaveLength(1);
    expect(result.current.frontier).toEqual(A);
    expect(result.current.shownPaperCount).toBe(10);
  });

  it("reset returns to an empty path", () => {
    const { result } = renderHook(() => useExplorer());
    act(() => result.current.startExplore(A));
    act(() => result.current.reset());
    expect(result.current.path).toHaveLength(0);
    expect(result.current.frontier).toBeNull();
  });
});
