import { ArrowLeft, ArrowRight } from "lucide-react";
import { authorId, type Author, type Publication } from "@skein/shared";
import { lastName } from "../lib/author.js";
import { Avatar } from "./Avatar.js";
import { Aside, SectionLabel } from "./Panel.js";
import styles from "./CoauthorsPanel.module.scss";

interface Props {
  paper: Publication;
  frontier: Author;
  pathIds: string[];
  onSelectCoauthor: (author: Author) => void;
  onBack: () => void;
}

export function CoauthorsPanel({ paper, frontier, pathIds, onSelectCoauthor, onBack }: Props) {
  const frontierId = authorId(frontier);
  const coauthors = paper.authors.filter((a) => authorId(a) !== frontierId);

  return (
    <Aside>
      <div className={styles.header}>
        <button className={styles.back} onClick={onBack}>
          <ArrowLeft size={15} aria-hidden />
          <span>Back to {lastName(frontier.name)}’s papers</span>
        </button>
        <SectionLabel>Open publication</SectionLabel>
        <div className={styles.title}>{paper.title}</div>
        <div className={styles.meta}>
          <span className={styles.journal}>{paper.journal}</span>
          {paper.year != null && <> · {paper.year}</>}
        </div>
      </div>

      <div className={styles.list}>
        <SectionLabel>Co-authors · {coauthors.length}</SectionLabel>
        <p className={styles.hint}>Select a co-author to continue the path to their work.</p>

        <div className={styles.items}>
          {coauthors.map((a, i) => {
            const onPath = pathIds.includes(authorId(a));
            return (
              <button
                key={`${authorId(a)}-${i}`}
                className={styles.item}
                onClick={() => onSelectCoauthor(a)}
              >
                <Avatar
                  name={a.name}
                  size={36}
                  fill={onPath ? "var(--accent)" : "var(--accent-2)"}
                />
                <span className={styles.itemBody}>
                  <span className={styles.itemName}>
                    {a.name}
                    {onPath && <span className={styles.onPath}>On path</span>}
                  </span>
                  {a.affiliation && <span className={styles.itemAff}>{a.affiliation}</span>}
                </span>
                <ArrowRight size={15} className={styles.itemArrow} aria-hidden />
              </button>
            );
          })}
          {coauthors.length === 0 && (
            <p className={styles.hint}>This paper lists no other authors.</p>
          )}
        </div>
      </div>
    </Aside>
  );
}
