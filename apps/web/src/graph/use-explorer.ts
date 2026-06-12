import { useCallback, useMemo, useState } from "react";
import { authorId, type Author } from "@spool/shared";

/** One author on the collaboration path, plus the paper that led to them. */
export interface PathStep {
  author: Author;
  viaPmid: string | null;
  viaTitle: string | null;
  viaJournal: string | null;
  viaYear: number | null;
}

/** The linking paper for a co-author hop (omitted for the seed). */
export interface ViaPaper {
  pmid: string;
  title: string;
  journal: string;
  year?: number;
}

const PAGE = 10;

const VIEW_RESET = { shownPaperCount: PAGE, highlightedPmid: null } as const;

function viaFields(via?: ViaPaper | null) {
  return {
    viaPmid: via?.pmid ?? null,
    viaTitle: via?.title ?? null,
    viaJournal: via?.journal ?? null,
    viaYear: via?.year ?? null,
  };
}

interface State {
  path: PathStep[];
  shownPaperCount: number;
  highlightedPmid: string | null;
}

const INITIAL: State = { path: [], shownPaperCount: PAGE, highlightedPmid: null };

/**
 * The guided-path exploration model: a single thread of authors.
 *   search → frontier blooms all co-authors clustered by paper → pick one → repeat
 * Picking an author already on the path rewinds to that point.
 */
export function useExplorer() {
  const [{ path, shownPaperCount, highlightedPmid }, setState] = useState<State>(INITIAL);

  const startExplore = useCallback((author: Author) => {
    setState({
      path: [{ author, ...viaFields(null) }],
      ...VIEW_RESET,
    });
  }, []);

  const selectCoauthor = useCallback((author: Author, via: ViaPaper | null) => {
    const id = authorId(author);
    setState((s) => {
      const existing = s.path.findIndex((p) => authorId(p.author) === id);
      const path =
        existing >= 0
          ? s.path.slice(0, existing + 1) // rewind to an author already on the path
          : [...s.path, { author, ...viaFields(via) }];
      return { path, ...VIEW_RESET };
    });
  }, []);

  const rewindTo = useCallback((index: number) => {
    setState((s) => ({
      path: s.path.slice(0, Math.max(0, index) + 1),
      ...VIEW_RESET,
    }));
  }, []);

  const clearPath = useCallback(() => rewindTo(0), [rewindTo]);

  const loadMorePapers = useCallback(() => {
    setState((s) => ({ ...s, shownPaperCount: s.shownPaperCount + PAGE }));
  }, []);

  const highlightPaper = useCallback((pmid: string | null) => {
    setState((s) => ({ ...s, highlightedPmid: pmid }));
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  const frontier = path.length ? path[path.length - 1]!.author : null;
  const pathIds = useMemo(() => path.map((p) => authorId(p.author)), [path]);

  return {
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
  };
}
