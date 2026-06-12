import { useMemo } from "react";
import { Building2, ArrowRight } from "lucide-react";
import { authorId, type Author, type Publication } from "@spool/shared";
import { authorLine } from "../lib/author.js";
import { Avatar } from "./avatar.js";
import { Aside, SectionLabel, Stat } from "./panel.js";
import styles from "./pubs-panel.module.scss";

interface Props {
  author: Author;
  /** All of the frontier's publications, newest-first. */
  publications: Publication[];
  loading: boolean;
  error: boolean;
  /** Paper whose row is highlighted (mirrors the graph cluster highlight). */
  highlightedPmid: string | null;
  depth: number;
  /** How many papers are rendered as rows (matches the graph's clusters). */
  shownCount: number;
  onHighlightPaper: (pmid: string | null) => void;
  onLoadMore: () => void;
}

export function PubsPanel({
  author,
  publications,
  loading,
  error,
  highlightedPmid,
  depth,
  shownCount,
  onHighlightPaper,
  onLoadMore,
}: Props) {
  const shown = publications.slice(0, shownCount);
  const hasMore = publications.length > shownCount;

  const stats = useMemo(() => {
    const coauthors = new Set<string>();
    let minYear = Infinity;
    let maxYear = -Infinity;
    const selfId = authorId(author);
    for (const p of publications) {
      if (p.year) {
        minYear = Math.min(minYear, p.year);
        maxYear = Math.max(maxYear, p.year);
      }
      for (const a of p.authors) {
        const id = authorId(a);
        if (id !== selfId) coauthors.add(id);
      }
    }
    const active =
      minYear <= maxYear ? `${minYear}–${String(maxYear).slice(2)}` : "—";
    return { papers: publications.length, coauthors: coauthors.size, active };
  }, [publications, author]);

  return (
    <Aside>
      <div className={styles.header}>
        <SectionLabel>
          {depth === 0 ? "Searched author" : `Step ${depth + 1} on the path`}
        </SectionLabel>
        <div className={styles.identity}>
          <Avatar name={author.name} size={48} fill="var(--accent)" />
          <div className={styles.identityBody}>
            <h3 className={styles.name}>{author.name}</h3>
            {author.affiliation && (
              <div className={styles.aff}>
                <Building2 size={12} className={styles.affIcon} aria-hidden />
                {author.affiliation}
              </div>
            )}
          </div>
        </div>
        <div className={styles.stats}>
          <Stat value={stats.papers} label="Papers" />
          <Stat value={stats.coauthors} label="Co-authors" />
          <Stat value={stats.active} label="Active" />
        </div>
      </div>

      <div className={styles.list}>
        <SectionLabel>Publications · {publications.length}</SectionLabel>
        <p className={styles.hint}>Click a paper to focus its co-author cluster.</p>

        {loading && <p className={styles.status}>Loading publications…</p>}
        {error && <p className={styles.statusError}>Couldn’t load publications — try again.</p>}
        {!loading && !error && publications.length === 0 && (
          <p className={styles.status}>No publications found.</p>
        )}

        {shown.map((p) => (
          <PubMedCard
            key={p.pmid}
            paper={p}
            selected={p.pmid === highlightedPmid}
            onClick={() => onHighlightPaper(p.pmid === highlightedPmid ? null : p.pmid)}
          />
        ))}
        {hasMore && (
          <button className={styles.loadMore} onClick={onLoadMore}>
            Load more papers
          </button>
        )}
      </div>
    </Aside>
  );
}

function PubMedCard({
  paper,
  selected,
  onClick,
}: {
  paper: Publication;
  selected: boolean;
  onClick: () => void;
}) {
  const aff = paper.authors[0]?.affiliation;
  const coCount = Math.max(paper.authors.length - 1, 0);
  return (
    <button
      className={`${styles.card} ${selected ? styles.cardSelected : ""}`}
      onClick={onClick}
    >
      <div className={styles.cardTitle}>{paper.title}</div>
      <div className={styles.cardAuthors}>{authorLine(paper.authors)}</div>
      <div className={styles.cardMeta}>
        <span className={styles.journal}>{paper.journal}</span>
        {paper.year != null && <> · {paper.year}</>}
      </div>
      {aff && (
        <div className={styles.cardAff}>
          <Building2 size={12} className={styles.affIcon} aria-hidden />
          <span className={styles.cardAffText}>{aff}</span>
        </div>
      )}
      <div className={styles.cardFooter}>
        <span className={styles.pmid}>PMID: {paper.pmid}</span>
        <span className={styles.coAuthors}>
          {coCount} co-author{coCount === 1 ? "" : "s"}
          <ArrowRight size={13} aria-hidden />
        </span>
      </div>
    </button>
  );
}
