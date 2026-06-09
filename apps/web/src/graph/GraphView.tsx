import { useMemo, useRef } from "react";
// @ts-expect-error
import ForceGraph2D from "react-force-graph-2d";
import type { GraphState } from "@skein/shared";
import styles from "./GraphView.module.scss";

interface Props {
  graph: GraphState;
  selectedId: string | null;
  onSelectNode: (id: string) => void;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function GraphView({ graph, selectedId, onSelectNode }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const data = useMemo(
    () => ({
      nodes: graph.nodes.map((n) => ({ id: n.id, name: n.author.name })),
      links: graph.links.map((l) => ({ source: l.source, target: l.target })),
    }),
    [graph],
  );

  const colors = useMemo(
    () => ({
      node: cssVar("--color-node") || "#4aa3ff",
      seed: cssVar("--color-node-seed") || "#ffb347",
      edge: cssVar("--color-edge") || "#3a4754",
      label: cssVar("--color-text") || "#e6edf3",
    }),
    [],
  );

  return (
    <div ref={ref} className={styles.wrap}>
      <ForceGraph2D
        graphData={data}
        linkColor={() => colors.edge}
        nodeColor={(n: any) =>
          n.id === graph.seedId ? colors.seed : n.id === selectedId ? colors.label : colors.node
        }
        nodeLabel={(n: any) => n.name}
        onNodeClick={(n: any) => onSelectNode(String(n.id))}
        nodeCanvasObjectMode={() => "after"}
        nodeCanvasObject={(n: any, ctx, scale) => {
          const label = String(n.name);
          ctx.font = `${12 / scale}px system-ui, sans-serif`;
          ctx.fillStyle = colors.label;
          ctx.fillText(label, n.x + 6 / scale, n.y + 3 / scale);
        }}
      />
    </div>
  );
}
