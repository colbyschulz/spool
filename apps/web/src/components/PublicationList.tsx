import type { Publication } from "@skein/shared";
import styles from "./PublicationList.module.scss";

interface Props {
  publications: Publication[];
  onExpand: (publication: Publication) => void;
}

export function PublicationList({ publications, onExpand }: Props) {
  if (publications.length === 0) return <p className={styles.empty}>No publications.</p>;
  return (
    <ul className={styles.list}>
      {publications.map((p) => (
        <li key={p.pmid}>
          <button className={styles.item} onClick={() => onExpand(p)}>
            <span className={styles.title}>{p.title}</span>
            <span className={styles.meta}>
              {p.journal}{p.year ? ` · ${p.year}` : ""}
            </span>
          </button>
          <a className={styles.link} href={p.pubmedUrl} target="_blank" rel="noreferrer">
            PubMed ↗
          </a>
        </li>
      ))}
    </ul>
  );
}
