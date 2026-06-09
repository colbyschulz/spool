import { useEffect } from "react";
import type { GraphState } from "@skein/shared";

const KEY = "skein.graph";

export function useLocalStorageSync(graph: GraphState): void {
  useEffect(() => {
    if (graph.nodes.length === 0) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(graph));
    } catch {
      /* storage may be unavailable; ignore */
    }
  }, [graph]);
}

export function loadFromLocalStorage(): GraphState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GraphState) : null;
  } catch {
    return null;
  }
}
