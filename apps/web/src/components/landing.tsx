import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { AuthorCandidate } from "@spool/shared";
import { useAuthorSearch } from "../api/hooks.js";
import { useDebouncedValue } from "../lib/use-debounced-value.js";
import { Avatar } from "./avatar.js";
import { Logo } from "./logo.js";
import styles from "./landing.module.scss";

interface Props {
  onPick: (candidate: AuthorCandidate) => void;
}

export function Landing({ onPick }: Props) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const debounced = useDebouncedValue(q.trim(), 300);
  const search = useAuthorSearch(debounced);

  const results = useMemo(
    () => [...(search.data ?? [])].sort((a, b) => b.paperCount - a.paperCount).slice(0, 6),
    [search.data],
  );
  const open = debounced.length > 0;

  function commit(c: AuthorCandidate | undefined) {
    if (c) onPick(c);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <Logo variant="lockup" size={28} />
          <span className={styles.kicker}>Pubmed network explorer</span>
        </div>
        <p className={styles.lede}>
          Look up an author to read their publications, then follow shared papers to trace
          who they write with.
        </p>

        <div className={styles.searchArea}>
          <div className={`${styles.searchBox} ${open && results.length ? styles.searchBoxOpen : ""}`}>
            <Search size={22} className={styles.searchIcon} aria-hidden />
            <input
              className={styles.input}
              aria-label="Author name"
              autoFocus
              value={q}
              placeholder="Author or institution…"
              onChange={(e) => {
                setQ(e.target.value);
                setHi(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHi((h) => Math.min(h + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHi((h) => Math.max(h - 1, 0));
                } else if (e.key === "Enter") {
                  commit(results[hi]);
                }
              }}
            />
            <kbd className={styles.kbd}>↵</kbd>
          </div>

          {open && (
            <div className={styles.results}>
              {search.isLoading && <div className={styles.status}>Searching…</div>}
              {search.isError && (
                <div className={styles.statusError}>NCBI unavailable — try again.</div>
              )}
              {!search.isLoading && !search.isError && results.length === 0 && (
                <div className={styles.status}>No authors found.</div>
              )}
              {results.map((c, i) => (
                <button
                  key={`${c.name}|${c.affiliation}`}
                  className={`${styles.result} ${i === hi ? styles.resultActive : ""}`}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => commit(c)}
                >
                  <Avatar name={c.name} size={36} />
                  <span className={styles.resultBody}>
                    <span className={styles.resultName}>{c.name}</span>
                    <span className={styles.resultAff}>{c.affiliation}</span>
                  </span>
                  <span className={styles.resultCount}>{c.paperCount} papers</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.footer}>Source · PubMed / NCBI E-utilities</div>
      </div>
    </div>
  );
}
