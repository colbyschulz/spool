import { useEffect, useRef } from "react";
import { RotateCcw } from "lucide-react";
import { authorId } from "@spool/shared";
import type { PathStep } from "../graph/use-explorer.js";
import { Avatar } from "./avatar.js";
import { Logo } from "./logo.js";
import styles from "./thread-bar.module.scss";

interface Props {
  path: PathStep[];
  frontierId: string | null;
  onSelectAuthor: (index: number) => void;
  onClear: () => void;
}

export function ThreadBar({ path, frontierId, onSelectAuthor, onClear }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const s = scrollerRef.current;
    if (s) s.scrollLeft = s.scrollWidth;
  }, [path.length]);

  return (
    <div className={styles.bar}>
      <div className={styles.label}>
        <Logo variant="mark" size={18} />
        <span className={styles.labelText}>Path</span>
      </div>

      <div ref={scrollerRef} className={styles.scroller}>
        {path.map((step, i) => {
          const active = authorId(step.author) === frontierId;
          return (
            <div key={`${authorId(step.author)}-${i}`} className={styles.segment}>
              {step.viaTitle && (
                <button
                  className={styles.via}
                  title={step.viaTitle}
                  onClick={() => onSelectAuthor(i)}
                >
                  <span className={styles.viaTitle}>“{step.viaTitle}”</span>
                  {(step.viaJournal || step.viaYear) && (
                    <span className={styles.viaMeta}>
                      {[step.viaJournal, step.viaYear].filter(Boolean).join(" ")}
                    </span>
                  )}
                </button>
              )}
              <button
                className={`${styles.chip} ${active ? styles.chipActive : ""}`}
                onClick={() => onSelectAuthor(i)}
              >
                <Avatar
                  name={step.author.name}
                  size={26}
                  fill={active ? "var(--fg-inverse)" : "var(--accent)"}
                  textColor={active ? "var(--accent)" : "var(--fg-inverse)"}
                />
                <span className={styles.chipName}>{step.author.name}</span>
              </button>
            </div>
          );
        })}
      </div>

      {path.length > 1 && (
        <button className={styles.reset} onClick={onClear}>
          <RotateCcw size={14} aria-hidden />
          Reset
        </button>
      )}
    </div>
  );
}
