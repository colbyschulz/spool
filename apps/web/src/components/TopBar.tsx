import { useMemo, useState } from "react";
import { Search, Spline } from "lucide-react";
import type { AuthorCandidate } from "@skein/shared";
import { useAuthorSearch } from "../api/hooks.js";
import { useDebouncedValue } from "../lib/useDebouncedValue.js";
import { Avatar } from "./Avatar.js";
import { ThreadMark } from "./ThreadMark.js";
import styles from "./TopBar.module.scss";

interface Props {
  onHome: () => void;
  onJump: (candidate: AuthorCandidate) => void;
  pathLen: number;
}

export function TopBar({ onHome, onJump, pathLen }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebouncedValue(q.trim(), 300);
  const search = useAuthorSearch(debounced);

  const results = useMemo(
    () => [...(search.data ?? [])].sort((a, b) => b.paperCount - a.paperCount).slice(0, 5),
    [search.data],
  );

  function jump(c: AuthorCandidate) {
    onJump(c);
    setQ("");
    setOpen(false);
  }

  return (
    <header className={styles.bar}>
      <button className={styles.brand} onClick={onHome}>
        <ThreadMark size={24} />
        <span className={styles.wordmark}>Skein</span>
      </button>

      <div className={styles.searchWrap}>
        <div className={styles.searchBox}>
          <Search size={15} className={styles.searchIcon} aria-hidden />
          <input
            className={styles.input}
            aria-label="Start over from another author"
            value={q}
            placeholder="Start over from another author…"
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
        </div>
        {open && results.length > 0 && (
          <div className={styles.results}>
            {results.map((c) => (
              <button
                key={`${c.name}|${c.affiliation}`}
                className={styles.result}
                onMouseDown={() => jump(c)}
              >
                <Avatar name={c.name} size={26} />
                <span className={styles.resultBody}>
                  <span className={styles.resultName}>{c.name}</span>
                  <span className={styles.resultAff}>{c.affiliation}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <span className={styles.counter}>
        <Spline size={14} aria-hidden />
        {pathLen}-author path
      </span>
    </header>
  );
}
