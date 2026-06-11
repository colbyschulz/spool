import { initials } from "../lib/author.js";
import styles from "./avatar.module.scss";

interface Props {
  name: string;
  size?: number;
  /** Background fill — defaults to olive. Pass a terracotta for path/frontier. */
  fill?: string;
  textColor?: string;
}

export function Avatar({ name, size = 32, fill, textColor }: Props) {
  return (
    <span
      className={styles.avatar}
      style={{
        width: size,
        height: size,
        background: fill ?? "var(--accent-2)",
        color: textColor ?? "var(--fg-inverse)",
        fontSize: size * 0.4,
      }}
    >
      {initials(name)}
    </span>
  );
}
