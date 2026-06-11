import styles from "./logo.module.scss";

type Theme = "light" | "dark" | "mono";

interface Props {
  variant?: "lockup" | "mark";
  theme?: Theme;
  /** Height of the mark in px. Wordmark scales proportionally. */
  size?: number;
  className?: string;
}

const PALETTE = {
  light: { flange: "#5C6633", thread: "#C4622D", text: "#1E1A14" },
  dark:  { flange: "#8A9657", thread: "#E0843F", text: "#F5F0E8" },
  mono:  { flange: "#1E1A14", thread: "#1E1A14", text: "#1E1A14" },
} as const;

export function Logo({ variant = "mark", theme = "light", size = 32, className }: Props) {
  const c = PALETTE[theme];
  const isLockup = variant === "lockup";
  const textSize = Math.round(size * 0.77);
  const gap = Math.round(size * 0.4);

  return (
    <span
      className={`${styles.root}${className ? ` ${className}` : ""}`}
      style={{ gap }}
      aria-label={isLockup ? "Spool" : undefined}
      role={isLockup ? "img" : undefined}
    >
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        {/* flanges — top and bottom rails */}
        <line x1="7" y1="5"  x2="25" y2="5"  stroke={c.flange} strokeWidth="2.6" strokeLinecap="round" />
        <line x1="7" y1="27" x2="25" y2="27" stroke={c.flange} strokeWidth="2.6" strokeLinecap="round" />
        {/* thread — three wound layers plus the trailing exit */}
        <line x1="11" y1="11" x2="21" y2="11" stroke={c.thread} strokeWidth="2.4" strokeLinecap="round" />
        <line x1="11" y1="16" x2="21" y2="16" stroke={c.thread} strokeWidth="2.4" strokeLinecap="round" />
        <line x1="11" y1="21" x2="21" y2="21" stroke={c.thread} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M21 21 C 26 21, 27 16, 29 17" stroke={c.thread} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      </svg>
      {isLockup && (
        <span
          className={styles.wordmark}
          style={{ fontSize: textSize, color: c.text }}
          aria-hidden="true"
        >
          Spool
        </span>
      )}
    </span>
  );
}
