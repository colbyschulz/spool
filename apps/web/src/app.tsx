import { useCallback, useMemo, useState } from "react";
import type { AuthorCandidate, Publication } from "@spool/shared";
import { Landing } from "./components/landing.js";
import { TopBar } from "./components/top-bar.js";
import { ThreadBar } from "./components/thread-bar.js";
import { PubsPanel } from "./components/pubs-panel.js";
import { GraphView } from "./graph/graph-view.js";
import { buildCoauthorGraph, byYearDesc } from "./graph/build-graph.js";
import { useExplorer } from "./graph/use-explorer.js";
import { useAuthorPublications } from "./api/hooks.js";
import styles from "./app.module.scss";

const EMPTY: Publication[] = [];

export function App() {
  const [phase, setPhase] = useState<"landing" | "explorer">("landing");
  const {
    path,
    shownPaperCount,
    highlightedPmid,
    frontier,
    pathIds,
    startExplore,
    selectCoauthor,
    rewindTo,
    clearPath,
    loadMorePapers,
    highlightPaper,
    reset,
  } = useExplorer();

  const pubs = useAuthorPublications(frontier?.name ?? null, frontier?.affiliation);
  const publications = pubs.data ?? EMPTY;

  // Single newest-first sort shared by the panel and the graph derivation —
  // buildCoauthorGraph requires pre-sorted input, so rows and clusters align.
  const sorted = useMemo(() => [...publications].sort(byYearDesc), [publications]);

  const graph = useMemo(
    () => buildCoauthorGraph(path, sorted, shownPaperCount),
    [path, sorted, shownPaperCount],
  );

  // Linking-paper title per consecutive path pair (path[i+1].viaTitle).
  const pathLabels = useMemo(() => path.slice(1).map((s) => s.viaTitle), [path]);

  const onPick = useCallback(
    (c: AuthorCandidate) => {
      startExplore({ name: c.name, affiliation: c.affiliation });
      setPhase("explorer");
    },
    [startExplore],
  );

  const onSelectCandidateNode = useCallback(
    (id: string) => {
      const hit = graph.candidates.get(id);
      if (hit) selectCoauthor(hit.author, hit.via);
    },
    [graph, selectCoauthor],
  );

  const onSelectPathNode = useCallback(
    (id: string) => {
      const index = pathIds.indexOf(id);
      if (index >= 0) rewindTo(index);
    },
    [pathIds, rewindTo],
  );

  if (phase === "landing" || !frontier) {
    return <Landing onPick={onPick} />;
  }

  const frontierId = pathIds[pathIds.length - 1] ?? null;

  return (
    <div className={styles.app}>
      <TopBar
        onHome={() => {
          reset();
          setPhase("landing");
        }}
        onJump={onPick}
        pathLen={path.length}
      />
      <ThreadBar
        path={path}
        frontierId={frontierId}
        onSelectAuthor={rewindTo}
        onClear={clearPath}
      />
      <div className={styles.body}>
        <PubsPanel
          author={frontier}
          publications={sorted}
          loading={pubs.isLoading}
          error={pubs.isError}
          highlightedPmid={highlightedPmid}
          depth={path.length - 1}
          shownCount={shownPaperCount}
          onHighlightPaper={highlightPaper}
          onLoadMore={loadMorePapers}
        />
        <div className={styles.canvas}>
          <GraphView
            nodes={graph.nodes}
            links={graph.links}
            pathIds={pathIds}
            pathLabels={pathLabels}
            highlightedPmid={highlightedPmid}
            frontierName={frontier.name}
            pubsLoading={pubs.isLoading}
            pubsError={pubs.isError}
            onSelectCandidate={onSelectCandidateNode}
            onSelectPath={onSelectPathNode}
          />
        </div>
      </div>
    </div>
  );
}
