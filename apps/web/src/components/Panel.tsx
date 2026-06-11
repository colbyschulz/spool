import type { ReactNode } from "react";
import styles from "./Panel.module.scss";

/** The fixed-width left detail panel shell. */
export function Aside({ children }: { children: ReactNode }) {
  return <aside className={styles.aside}>{children}</aside>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className={styles.sectionLabel}>{children}</div>;
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}
