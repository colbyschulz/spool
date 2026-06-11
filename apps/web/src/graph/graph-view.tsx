import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Plus, Minus, Maximize } from "lucide-react";
import { initials, lastName } from "../lib/author.js";
import styles from "./graph-view.module.scss";

export type NodeRole = "frontier" | "path" | "candidate";

export interface GraphNodeView {
  id: string;
  name: string;
  role: NodeRole;
}

export interface GraphLinkView {
  source: string;
  target: string;
  kind: "path" | "candidate";
}

interface Props {
  nodes: GraphNodeView[];
  links: GraphLinkView[];
  /** Ordered author ids from seed → frontier; drives the glowing thread. */
  pathIds: string[];
  /** Linking-paper title per segment: pathLabels[i] joins pathIds[i] → pathIds[i+1]. */
  pathLabels: (string | null)[];
  mode: "pubs" | "coauthors";
  frontierName: string | null;
  onSelectCandidate: (id: string) => void;
  onSelectPath: (id: string) => void;
}

// World-unit geometry — the graph scales with zoom, so these stay constant.
const NODE_R = 22;
const THREAD_W = 4.5;
const GLOW_W = 13;

// Light-theme palette (earth tones), mirroring the design's light canvas.
const COLORS = {
  canvas: "#ede8dc",
  frontierFill: "#c4622d",
  frontierRing: "#5e2b11",
  pathFill: "#cc7750",
  candFill: "#fdfaf5",
  candBorder: "#c8bfb0",
  candBorderHover: "#c4622d",
  initOnAccent: "#fdfaf5",
  candInit: "#6e6257",
  candInitHover: "#c4622d",
  label: "#2e271f",
  labelDim: "#6e6257",
  candidateEdge: "#9b8e7e",
  thread: "#c4622d",
  threadGlow: "#c4622d",
};

const EDGE_LABEL_MAX = 36;

function truncate(s: string): string {
  return s.length > EDGE_LABEL_MAX ? s.slice(0, EDGE_LABEL_MAX - 1) + "…" : s;
}

interface SimNode extends GraphNodeView {
  x?: number;
  y?: number;
}

export function GraphView({
  nodes,
  links,
  pathIds,
  pathLabels,
  mode,
  frontierName,
  onSelectCandidate,
  onSelectPath,
}: Props) {
  const fgRef = useRef<any>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Persistent node/link object registries so react-force-graph keeps positions
  // across renders (it tracks layout by object identity, not by id).
  const nodeReg = useRef<Map<string, SimNode>>(new Map());
  const linkReg = useRef<Map<string, any>>(new Map());

  const graphData = useMemo(() => {
    const reg = nodeReg.current;
    const ids = new Set(nodes.map((n) => n.id));
    for (const id of [...reg.keys()]) if (!ids.has(id)) reg.delete(id);
    const nodeObjs = nodes.map((n) => {
      let o = reg.get(n.id);
      if (!o) {
        o = { ...n };
        reg.set(n.id, o);
      }
      o.name = n.name;
      o.role = n.role;
      return o;
    });

    const lreg = linkReg.current;
    const keys = new Set(links.map((l) => `${l.source}|${l.target}`));
    for (const k of [...lreg.keys()]) if (!keys.has(k)) lreg.delete(k);
    const linkObjs = links.map((l) => {
      const k = `${l.source}|${l.target}`;
      let o = lreg.get(k);
      if (!o) {
        o = { source: l.source, target: l.target };
        lreg.set(k, o);
      }
      o.kind = l.kind;
      return o;
    });

    return { nodes: nodeObjs, links: linkObjs };
  }, [nodes, links]);

  // Keep a fresh handle on positioned nodes for the thread renderer.
  const dataRef = useRef(graphData);
  dataRef.current = graphData;
  const pathRef = useRef(pathIds);
  pathRef.current = pathIds;
  const pathLabelsRef = useRef(pathLabels);
  pathLabelsRef.current = pathLabels;

  // Spread the layout out and give the path room to breathe.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-1400);
    fg.d3Force("link")?.distance((l: any) => (l.kind === "path" ? 170 : 130));
  }, []);

  useEffect(() => {
    fgRef.current?.d3ReheatSimulation();
  }, [nodes.length, links.length]);

  const drawThread = useCallback((ctx: CanvasRenderingContext2D) => {
    const ids = pathRef.current;
    if (!ids || ids.length < 2) return;
    const reg = nodeReg.current;
    const pts: [number, number][] = [];
    for (const id of ids) {
      const n = reg.get(id);
      if (n && n.x != null && n.y != null) pts.push([n.x, n.y]);
    }
    if (pts.length < 2) return;

    // Catmull-Rom-ish smooth path through the path nodes.
    let d = new Path2D();
    d.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // soft glow underlay
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = COLORS.threadGlow;
    ctx.lineWidth = GLOW_W;
    ctx.stroke(d);
    // crisp thread
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS.thread;
    ctx.lineWidth = THREAD_W;
    ctx.stroke(d);
    ctx.restore();
  }, []);

  // Edge labels: the paper title that links each consecutive pair on the path.
  // Drawn in a post pass so the pills sit above nodes and stay readable.
  const drawThreadLabels = useCallback((ctx: CanvasRenderingContext2D, scale: number) => {
    const ids = pathRef.current;
    const labels = pathLabelsRef.current;
    if (!ids || ids.length < 2) return;
    const reg = nodeReg.current;
    const fontSize = Math.max(11, 10 / scale);
    const padX = 6 / scale;
    const padY = 4 / scale;

    ctx.save();
    ctx.font = `500 ${fontSize}px Roboto, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < ids.length - 1; i++) {
      const title = labels[i];
      if (!title) continue;
      const a = reg.get(ids[i]!);
      const b = reg.get(ids[i + 1]!);
      if (!a || !b || a.x == null || b.x == null) continue;
      const mx = (a.x + b.x!) / 2;
      const my = (a.y! + b.y!) / 2;
      const text = truncate(title);
      const w = ctx.measureText(text).width + padX * 2;
      const h = fontSize + padY * 2;

      // pill background
      ctx.fillStyle = COLORS.canvas;
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.roundRect(mx - w / 2, my - h / 2, w, h, 4 / scale);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = COLORS.candBorder;
      ctx.lineWidth = 1 / scale;
      ctx.stroke();

      // title text
      ctx.fillStyle = COLORS.label;
      ctx.fillText(text, mx, my);
    }
    ctx.restore();
  }, []);

  const paintNode = useCallback(
    (node: SimNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const { role } = node;
      const isHover = node.id === hoverId;
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      let fill: string;
      let initFill: string;
      if (role === "frontier") {
        fill = COLORS.frontierFill;
        initFill = COLORS.initOnAccent;
      } else if (role === "path") {
        fill = COLORS.pathFill;
        initFill = COLORS.initOnAccent;
      } else {
        fill = COLORS.candFill;
        initFill = isHover ? COLORS.candInitHover : COLORS.candInit;
      }

      // candidate hover halo
      if (role === "candidate" && isHover) {
        ctx.beginPath();
        ctx.arc(x, y, NODE_R + 6, 0, 2 * Math.PI);
        ctx.strokeStyle = COLORS.candBorderHover;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // node body
      ctx.beginPath();
      ctx.arc(x, y, NODE_R, 0, 2 * Math.PI);
      ctx.fillStyle = fill;
      ctx.fill();
      if (role === "candidate") {
        ctx.strokeStyle = isHover ? COLORS.candBorderHover : COLORS.candBorder;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (role === "frontier") {
        ctx.beginPath();
        ctx.arc(x, y, NODE_R + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = COLORS.frontierRing;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // initials
      ctx.fillStyle = initFill;
      ctx.font = `700 15px Syne, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initials(node.name), x, y + 0.5);

      // label below
      const labelSize = Math.max(13, 12 / scale);
      ctx.font = `${role === "frontier" ? "700" : "500"} ${labelSize}px Roboto, sans-serif`;
      ctx.fillStyle =
        role === "candidate" ? (isHover ? COLORS.label : COLORS.labelDim) : COLORS.label;
      ctx.textBaseline = "top";
      ctx.fillText(lastName(node.name), x, y + NODE_R + 6);
    },
    [hoverId],
  );

  const paintPointerArea = useCallback(
    (node: SimNode, color: string, ctx: CanvasRenderingContext2D) => {
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, NODE_R, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    [],
  );

  const zoomBy = (f: number) => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.zoom(fg.zoom() * f, 250);
  };

  return (
    <div className={styles.wrap}>
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        backgroundColor={COLORS.canvas}
        nodeRelSize={NODE_R}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={paintPointerArea}
        onNodeHover={(n: SimNode | null) => setHoverId(n ? n.id : null)}
        onNodeClick={(n: SimNode) => {
          if (n.role === "candidate") onSelectCandidate(n.id);
          else onSelectPath(n.id);
        }}
        onRenderFramePre={(ctx: CanvasRenderingContext2D) => drawThread(ctx)}
        onRenderFramePost={(ctx: CanvasRenderingContext2D, scale: number) =>
          drawThreadLabels(ctx, scale)
        }
        linkColor={(l: any) => (l.kind === "candidate" ? COLORS.candidateEdge : "rgba(0,0,0,0)")}
        linkWidth={(l: any) => (l.kind === "candidate" ? 1.5 : 0)}
        linkLineDash={(l: any) => (l.kind === "candidate" ? [2, 5] : null)}
      />

      {mode === "pubs" && frontierName && (
        <div className={styles.hint}>
          Open one of {lastName(frontierName)}’s publications to reveal co-authors
        </div>
      )}

      <div className={styles.controls}>
        <button className={styles.ctrlBtn} title="Zoom in" onClick={() => zoomBy(1.2)}>
          <Plus size={16} aria-hidden />
        </button>
        <button className={styles.ctrlBtn} title="Zoom out" onClick={() => zoomBy(0.83)}>
          <Minus size={16} aria-hidden />
        </button>
        <button
          className={styles.ctrlBtn}
          title="Fit to view"
          onClick={() => fgRef.current?.zoomToFit(400, 80)}
        >
          <Maximize size={15} aria-hidden />
        </button>
      </div>

      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: COLORS.frontierFill }} />
          <span className={styles.legendLabel}>On your path</span>
        </div>
        <div className={styles.legendItem}>
          <span
            className={styles.legendDot}
            style={{ background: COLORS.candFill, border: `1.5px solid ${COLORS.candBorder}` }}
          />
          <span className={styles.legendLabel}>Co-author (selectable)</span>
        </div>
        <div className={styles.legendItem}>
          <svg width="24" height="11" aria-hidden>
            <path
              d="M1 6 C 7 1, 16 11, 23 5"
              stroke={COLORS.thread}
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          <span className={styles.legendLabel}>The thread</span>
        </div>
      </div>
    </div>
  );
}
