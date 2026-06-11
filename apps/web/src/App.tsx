import { useCallback, useMemo, useState } from "react";
import { authorId, type Author, type AuthorCandidate } from "@skein/shared";
import { Landing } from "./components/Landing.js";
import { TopBar } from "./components/TopBar.js";
import { ThreadBar } from "./components/ThreadBar.js";
import { PubsPanel } from "./components/PubsPanel.js";
import { CoauthorsPanel } from "./components/CoauthorsPanel.js";
import { GraphView, type GraphNodeView, type GraphLinkView } from "./graph/GraphView.js";
import { useExplorer } from "./graph/useExplorer.js";
import { useAuthorPublications } from "./api/hooks.js";
import styles from "./App.module.scss";

export function App() {
  const [phase, setPhase] = useState<"landing" | "explorer">("landing");
  const {
    path,
    mode,
    selectedPmid,
    frontier,
    pathIds,
    startExplore,
    selectPub,
    backToPubs,
    selectCoauthor,
    rewindTo,
    clearPath,
    reset,
  } = useExplorer();

  const pubs = useAuthorPublications(frontier?.name ?? null, frontier?.affiliation);
  const publications = pubs.data ?? [];
  const selectedPub = useMemo(
    () => publications.find((p) => p.pmid === selectedPmid) ?? null,
    [publications, selectedPmid],
  );

  const frontierId = frontier ? authorId(frontier) : null;

  // Co-author candidates for the open paper: not the frontier, not already on the path.
  const candidates = useMemo<Author[]>(() => {
    if (mode !== "coauthors" || !selectedPub) return [];
    const seen = new Set<string>();
    const out: Author[] = [];
    for (const a of selectedPub.authors) {
      const id = authorId(a);
      if (id === frontierId || pathIds.includes(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(a);
    }
    return out;
  }, [mode, selectedPub, frontierId, pathIds]);

  const candidatesById = useMemo(() => {
    const m = new Map<string, Author>();
    for (const a of candidates) m.set(authorId(a), a);
    return m;
  }, [candidates]);

  const graphNodes = useMemo<GraphNodeView[]>(() => {
    const pathNodes = path.map((step) => {
      const id = authorId(step.author);
      return { id, name: step.author.name, role: id === frontierId ? "frontier" : "path" } as const;
    });
    const candNodes = candidates.map(
      (a) => ({ id: authorId(a), name: a.name, role: "candidate" }) as const,
    );
    return [...pathNodes, ...candNodes];
  }, [path, candidates, frontierId]);

  // Title of the paper linking each consecutive path pair: segment i joins
  // pathIds[i] → pathIds[i+1], established by path[i+1].viaTitle.
  const pathLabels = useMemo(() => path.slice(1).map((s) => s.viaTitle), [path]);

  const graphLinks = useMemo<GraphLinkView[]>(() => {
    const out: GraphLinkView[] = [];
    for (let i = 0; i < pathIds.length - 1; i++) {
      out.push({ source: pathIds[i]!, target: pathIds[i + 1]!, kind: "path" });
    }
    if (frontierId) {
      for (const a of candidates) {
        out.push({ source: frontierId, target: authorId(a), kind: "candidate" });
      }
    }
    return out;
  }, [pathIds, candidates, frontierId]);

  const onPick = useCallback(
    (c: AuthorCandidate) => {
      startExplore({ name: c.name, affiliation: c.affiliation });
      setPhase("explorer");
    },
    [startExplore],
  );

  const onSelectCandidateNode = useCallback(
    (id: string) => {
      const author = candidatesById.get(id);
      if (!author || !selectedPub) return;
      selectCoauthor(author, {
        pmid: selectedPub.pmid,
        title: selectedPub.title,
        journal: selectedPub.journal,
        year: selectedPub.year,
      });
    },
    [candidatesById, selectedPub, selectCoauthor],
  );

  const onSelectPathNode = useCallback(
    (id: string) => {
      const index = pathIds.indexOf(id);
      if (index >= 0) rewindTo(index);
    },
    [pathIds, rewindTo],
  );

  const onCoauthorPick = useCallback(
    (author: Author) => {
      if (!selectedPub) return;
      selectCoauthor(author, {
        pmid: selectedPub.pmid,
        title: selectedPub.title,
        journal: selectedPub.journal,
        year: selectedPub.year,
      });
    },
    [selectedPub, selectCoauthor],
  );

  if (phase === "landing" || !frontier) {
    return <Landing onPick={onPick} />;
  }

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
        {mode === "coauthors" && selectedPub ? (
          <CoauthorsPanel
            paper={selectedPub}
            frontier={frontier}
            pathIds={pathIds}
            onSelectCoauthor={onCoauthorPick}
            onBack={backToPubs}
          />
        ) : (
          <PubsPanel
            author={frontier}
            publications={publications}
            loading={pubs.isLoading}
            error={pubs.isError}
            selectedPmid={selectedPmid}
            depth={path.length - 1}
            onSelectPub={selectPub}
          />
        )}
        <div className={styles.canvas}>
          <GraphView
            nodes={graphNodes}
            links={graphLinks}
            pathIds={pathIds}
            pathLabels={pathLabels}
            mode={mode}
            frontierName={frontier.name}
            onSelectCandidate={onSelectCandidateNode}
            onSelectPath={onSelectPathNode}
          />
        </div>
      </div>
    </div>
  );
}
