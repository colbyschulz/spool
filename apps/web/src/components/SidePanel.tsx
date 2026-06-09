import type { Author, Publication } from "@skein/shared";
import { PublicationList } from "./PublicationList.js";
import styles from "./SidePanel.module.scss";

interface Props {
  author: Author | null;
  publications: Publication[];
  loading: boolean;
  onExpand: (publication: Publication) => void;
  onClose: () => void;
}

export function SidePanel({ author, publications, loading, onExpand, onClose }: Props) {
  if (!author) return null;
  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.name}>{author.name}</h2>
          {author.affiliation && <p className={styles.aff}>{author.affiliation}</p>}
        </div>
        <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
      </header>
      {loading ? (
        <p className={styles.loading}>Loading publications…</p>
      ) : (
        <PublicationList publications={publications} onExpand={onExpand} />
      )}
    </aside>
  );
}
