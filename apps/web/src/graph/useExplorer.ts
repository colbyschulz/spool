import { useCallback, useMemo, useState } from "react";
import { authorId, type Author } from "@skein/shared";

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

type Mode = "pubs" | "coauthors";

interface State {
  path: PathStep[];
  mode: Mode;
  selectedPmid: string | null;
}

const INITIAL: State = { path: [], mode: "pubs", selectedPmid: null };

/**
 * The guided-path exploration model: a single thread of authors.
 *   search → pubs → open paper → coauthors → pick one → pubs → …
 * Picking a co-author already on the path rewinds to that point.
 */
export function useExplorer() {
  const [{ path, mode, selectedPmid }, setState] = useState<State>(INITIAL);

  const startExplore = useCallback((author: Author) => {
    setState({
      path: [{ author, viaPmid: null, viaTitle: null, viaJournal: null, viaYear: null }],
      mode: "pubs",
      selectedPmid: null,
    });
  }, []);

  const selectPub = useCallback((pmid: string) => {
    setState((s) => ({ ...s, selectedPmid: pmid, mode: "coauthors" }));
  }, []);

  const backToPubs = useCallback(() => {
    setState((s) => ({ ...s, selectedPmid: null, mode: "pubs" }));
  }, []);

  const selectCoauthor = useCallback((author: Author, via: ViaPaper | null) => {
    const id = authorId(author);
    setState((s) => {
      const existing = s.path.findIndex((p) => authorId(p.author) === id);
      const path =
        existing >= 0
          ? s.path.slice(0, existing + 1) // rewind to an author already on the path
          : [
              ...s.path,
              {
                author,
                viaPmid: via?.pmid ?? null,
                viaTitle: via?.title ?? null,
                viaJournal: via?.journal ?? null,
                viaYear: via?.year ?? null,
              },
            ];
      return { path, mode: "pubs", selectedPmid: null };
    });
  }, []);

  const rewindTo = useCallback((index: number) => {
    setState((s) => ({ path: s.path.slice(0, index + 1), mode: "pubs", selectedPmid: null }));
  }, []);

  const clearPath = useCallback(() => {
    setState((s) => ({ path: s.path.slice(0, 1), mode: "pubs", selectedPmid: null }));
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  const frontier = path.length ? path[path.length - 1]!.author : null;
  const pathIds = useMemo(() => path.map((p) => authorId(p.author)), [path]);

  return {
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
  };
}
