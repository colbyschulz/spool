import { useEffect } from "react";
import type { GraphState } from "@skein/shared";
import { encodeGraph, decodeGraph } from "./encode.js";

export function readGraphFromUrl(): GraphState | null {
  const hash = window.location.hash.replace(/^#/, "");
  return hash ? decodeGraph(hash) : null;
}

export function useUrlGraphSync(graph: GraphState): void {
  useEffect(() => {
    if (graph.nodes.length === 0) return;
    const hash = encodeGraph(graph);
    if (hash !== window.location.hash.replace(/^#/, "")) {
      history.replaceState(null, "", `#${hash}`);
    }
  }, [graph]);
}

export function copyShareLink(graph: GraphState): Promise<void> {
  const url = `${window.location.origin}${window.location.pathname}#${encodeGraph(graph)}`;
  return navigator.clipboard.writeText(url);
}
