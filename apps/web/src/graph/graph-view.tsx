import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d";
import { Plus, Minus, Maximize } from "lucide-react";
import { initials, lastName } from "../lib/author.js";
import styles from "./graph-view.module.scss";
import type { BuiltNode, BuiltLink } from "./build-graph.js";

interface Props {
  nodes: BuiltNode[];
  links: BuiltLink[];
  /** Ordered author ids from seed → frontier; drives the glowing thread. */
  pathIds: string[];
  /** Linking-paper title per segment: pathLabels[i] joins pathIds[i] → pathIds[i+1]. */
  pathLabels: (string | null)[];
  /** Paper whose cluster is emphasized + centered; null = none. */
  highlightedPmid: string | null;
  frontierName: string | null;
  pubsLoading: boolean;
  pubsError: boolean;
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

const DIM_ALPHA = 0.18;

// Camera animation tuning.
const FIT_MS = 400; // zoomToFit animation duration
const FIT_PAD = 80; // padding (px) around the fitted graph
const FOCUS_ZOOM = 2; // zoom level when centering on a highlighted cluster
const FOCUS_MS = 500; // highlight focus / clear animation duration
const SETTLE_FIT_DELAY_MS = 250; // wait before the mid-settle frame so nodes have spread a bit

const EDGE_LABEL_MAX = 36;

function truncate(s: string): string {
  return s.length > EDGE_LABEL_MAX ? s.slice(0, EDGE_LABEL_MAX - 1) + "…" : s;
}

interface SimNode extends BuiltNode {
  x?: number;
  y?: number;
}

/**
 * Mutable link object owned by the simulation; force-graph rewrites the string
 * endpoints to node objects once it binds the data.
 */
interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
  kind: BuiltLink["kind"];
}

// Path links are invisible (the thread is drawn separately); anchor and
// candidate links render dashed so each cluster visibly hangs off the
// frontier: frontier ┄┄ caption ┄┄ co-authors.
const linkColor = (l: SimLink) => (l.kind === "path" ? "rgba(0,0,0,0)" : COLORS.candidateEdge);
const linkWidth = (l: SimLink) => (l.kind === "path" ? 0 : l.kind === "anchor" ? 1.5 : 1.2);
const linkLineDash = (l: SimLink) =>
  l.kind === "path" ? null : l.kind === "anchor" ? [4, 4] : [2, 5];

export function GraphView({
  nodes,
  links,
  pathIds,
  pathLabels,
  highlightedPmid,
  frontierName,
  pubsLoading,
  pubsError,
  onSelectCandidate,
  onSelectPath,
}: Props) {
  const fgRef = useRef<
    ForceGraphMethods<NodeObject<SimNode>, LinkObject<SimNode, SimLink>> | undefined
  >(undefined);
  // Hover is paint-only state: a ref (not useState) so pointer moves don't
  // re-render the component — force-graph repaints on its own on interaction.
  const hoverRef = useRef<string | null>(null);

  // Measure the actual canvas viewport. Without explicit width/height,
  // react-force-graph defaults to window dimensions — the canvas overflows the
  // container and every zoomToFit/centerAt frames against the wrong geometry.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setDims({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ready = dims.width > 0 && dims.height > 0;

  // Persistent node/link object registries so react-force-graph keeps positions
  // across renders (it tracks layout by object identity, not by id).
  const nodeReg = useRef<Map<string, SimNode>>(new Map());
  const linkReg = useRef<Map<string, SimLink>>(new Map());

  const graphData = useMemo(() => {
    const reg = nodeReg.current;
    const ids = new Set(nodes.map((n) => n.id));
    // eslint-disable-next-line react-hooks/refs -- registry pattern: ref-backed Map is deliberately pruned in this memo so layout objects persist by identity
    for (const id of [...reg.keys()]) if (!ids.has(id)) reg.delete(id);

    // Seed new anchor/candidate nodes near the frontier so they bloom outward
    // from it rather than flying in from (0,0) across the canvas.
    const frontierObj = nodes.find((n) => n.role === "frontier");
    // eslint-disable-next-line react-hooks/refs -- registry pattern: reads the frontier's persisted layout position to seed new nodes
    const frontierPos = frontierObj ? reg.get(frontierObj.id) : undefined;

    // eslint-disable-next-line react-hooks/refs -- registry pattern: the map callback reads/writes the ref-backed registry by design
    const nodeObjs = nodes.map((n) => {
      let o = reg.get(n.id);
      if (!o) {
        o = { ...n };
        if (
          (n.role === "anchor" || n.role === "candidate") &&
          frontierPos?.x != null &&
          frontierPos.y != null
        ) {
          // eslint-disable-next-line react-hooks/purity -- deliberate: random angle seeds a new node's initial position exactly once
          const a = Math.random() * Math.PI * 2;
          o.x = frontierPos.x + Math.cos(a) * 15;
          o.y = frontierPos.y + Math.sin(a) * 15;
        }
        reg.set(n.id, o);
      }
      o.name = n.name;
      o.role = n.role;
      o.pmid = n.pmid;
      o.title = n.title;
      return o;
    });

    const lreg = linkReg.current;
    const keys = new Set(links.map((l) => `${l.source}|${l.target}`));
    // eslint-disable-next-line react-hooks/refs -- registry pattern: ref-backed Map is deliberately pruned in this memo so link objects persist by identity
    for (const k of [...lreg.keys()]) if (!keys.has(k)) lreg.delete(k);
    // eslint-disable-next-line react-hooks/refs -- registry pattern: the map callback reads/writes the ref-backed registry by design
    const linkObjs = links.map((l) => {
      const k = `${l.source}|${l.target}`;
      let o = lreg.get(k);
      if (!o) {
        o = { source: l.source, target: l.target, kind: l.kind };
        lreg.set(k, o);
      }
      o.kind = l.kind;
      return o;
    });

    return { nodes: nodeObjs, links: linkObjs };
  }, [nodes, links]);

  const pathRef = useRef(pathIds);
  // eslint-disable-next-line react-hooks/refs -- deliberate render-time mirror so canvas draw callbacks see the latest props without re-creating
  pathRef.current = pathIds;
  const pathLabelsRef = useRef(pathLabels);
  // eslint-disable-next-line react-hooks/refs -- deliberate render-time mirror so canvas draw callbacks see the latest props without re-creating
  pathLabelsRef.current = pathLabels;

  const highlightRef = useRef(highlightedPmid);
  // eslint-disable-next-line react-hooks/refs -- deliberate render-time mirror so canvas draw callbacks see the latest props without re-creating
  highlightRef.current = highlightedPmid;

  // Fit the whole graph to the viewport once after each structural change settles.
  const shouldFitRef = useRef(true);

  // Highlight: center+zoom on the chosen cluster; CLEARING a highlight reframes
  // all. The prev ref keeps the initial null from firing a fit mid-simulation.
  const prevHighlightRef = useRef<string | null>(null);
  useEffect(() => {
    const fg = fgRef.current;
    const prev = prevHighlightRef.current;
    prevHighlightRef.current = highlightedPmid;
    if (!fg) return;
    if (!highlightedPmid) {
      if (prev) fg.zoomToFit(FOCUS_MS, FIT_PAD); // only on an actual clear, not on mount
      return;
    }
    const anchor = nodeReg.current.get("anchor:" + highlightedPmid);
    if (anchor && anchor.x != null && anchor.y != null) {
      fg.centerAt(anchor.x, anchor.y, FOCUS_MS);
      fg.zoom(FOCUS_ZOOM, FOCUS_MS);
    }
  }, [highlightedPmid]);

  // Spread the layout out and give the path room to breathe. Runs once the
  // graph is actually mounted (it renders only after the viewport is measured).
  useEffect(() => {
    if (!ready) return;
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-600);
    fg.d3Force("link")?.distance((l: SimLink) =>
      l.kind === "path" ? 170 : l.kind === "anchor" ? 90 : 120,
    );
  }, [ready]);

  // Reheat + refit on every structural change: graphData's memo identity
  // changes exactly when the nodes/links props do (registry-backed memo), so
  // it is a reliable structural signal — unlike count proxies, which miss
  // changes that leave the totals equal.
  useEffect(() => {
    if (!ready) return;
    fgRef.current?.d3ReheatSimulation();
    // While publications are in flight the graph is just the bare path — fitting
    // it would slam the camera in, then right back out when the clusters arrive.
    // Hold the camera until the loaded graph lands (or the load errors out).
    if (pubsLoading) return;
    shouldFitRef.current = true;
    // Frame nodes mid-animation so they're visible while settling, not just at the end.
    const t = setTimeout(() => {
      if (fgRef.current && !highlightRef.current) fgRef.current.zoomToFit(FIT_MS, FIT_PAD);
    }, SETTLE_FIT_DELAY_MS);
    return () => clearTimeout(t);
  }, [ready, graphData, pubsLoading]);

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
    const d = new Path2D();
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

  const drawPaperCaptions = useCallback((ctx: CanvasRenderingContext2D, scale: number) => {
    const reg = nodeReg.current;
    const hl = highlightRef.current;
    const hlActive = hl != null && reg.has("anchor:" + hl);
    const fontSize = Math.max(11, 10 / scale);
    const padX = 6 / scale;
    const padY = 4 / scale;

    ctx.save();
    ctx.font = `600 ${fontSize}px Roboto, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const n of reg.values()) {
      if (n.role !== "anchor" || n.x == null || n.y == null || !n.title) continue;
      const faded = hlActive && n.pmid !== hl;
      const text = truncate(n.title);
      const w = ctx.measureText(text).width + padX * 2;
      const h = fontSize + padY * 2;

      ctx.globalAlpha = faded ? DIM_ALPHA : 0.95;
      ctx.fillStyle = COLORS.canvas;
      ctx.beginPath();
      ctx.roundRect(n.x - w / 2, n.y - h / 2, w, h, 4 / scale);
      ctx.fill();
      ctx.strokeStyle = n.pmid === hl ? COLORS.candBorderHover : COLORS.candBorder;
      ctx.lineWidth = 1 / scale;
      ctx.stroke();

      ctx.globalAlpha = faded ? DIM_ALPHA : 1;
      ctx.fillStyle = COLORS.label;
      ctx.fillText(text, n.x, n.y);
    }
    ctx.restore();
  }, []);

  const paintNode = useCallback(
    (node: SimNode, ctx: CanvasRenderingContext2D, scale: number) => {
      if (node.role === "anchor") return; // anchors are invisible cluster centers
      const hl = highlightRef.current;
      const hlActive = hl != null && nodeReg.current.has("anchor:" + hl);
      const dimmed = hlActive && node.role === "candidate" && node.pmid !== hl;
      ctx.save();
      if (dimmed) ctx.globalAlpha = DIM_ALPHA;

      const { role } = node;
      const isHover = node.id === hoverRef.current;
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
        ctx.globalAlpha = dimmed ? DIM_ALPHA : 1;
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

      ctx.restore();
    },
    [],
  );

  const paintPointerArea = useCallback(
    (node: SimNode, color: string, ctx: CanvasRenderingContext2D) => {
      if (node.role === "anchor") return; // not hoverable / clickable
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, NODE_R, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    [],
  );

  const handleNodeHover = useCallback((n: SimNode | null) => {
    hoverRef.current = n ? n.id : null;
  }, []);

  const handleNodeClick = useCallback(
    (n: SimNode) => {
      if (n.role === "anchor") return;
      if (n.role === "candidate") onSelectCandidate(n.id);
      else onSelectPath(n.id);
    },
    [onSelectCandidate, onSelectPath],
  );

  const drawPostFrame = useCallback(
    (ctx: CanvasRenderingContext2D, scale: number) => {
      drawPaperCaptions(ctx, scale);
      drawThreadLabels(ctx, scale);
    },
    [drawPaperCaptions, drawThreadLabels],
  );

  const handleEngineStop = useCallback(() => {
    if (shouldFitRef.current && !highlightRef.current) {
      fgRef.current?.zoomToFit(FIT_MS, FIT_PAD);
      shouldFitRef.current = false;
    }
  }, []);

  const zoomBy = (f: number) => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.zoom(fg.zoom() * f, 250);
  };

  return (
    <div ref={wrapRef} className={styles.wrap}>
      {ready && (
      <ForceGraph2D<SimNode, SimLink>
        ref={fgRef}
        width={dims.width}
        height={dims.height}
        graphData={graphData}
        backgroundColor={COLORS.canvas}
        nodeRelSize={NODE_R}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={paintPointerArea}
        // Hover lives in a ref (no React render), so the canvas must keep
        // repainting after the engine stops or the hover halo would freeze.
        autoPauseRedraw={false}
        onNodeHover={handleNodeHover}
        onNodeClick={handleNodeClick}
        onRenderFramePre={drawThread}
        onRenderFramePost={drawPostFrame}
        warmupTicks={200}
        cooldownTime={2000}
        onEngineStop={handleEngineStop}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkLineDash={linkLineDash}
      />
      )}

      {frontierName && !pubsLoading && !pubsError && nodes.every((n) => n.role !== "candidate") && (
        <div className={styles.hint}>
          No co-authors found for {lastName(frontierName)}'s recent papers
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
          onClick={() => fgRef.current?.zoomToFit(FIT_MS, FIT_PAD)}
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
          <span className={styles.legendLabel}>Co-author — click to follow</span>
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
