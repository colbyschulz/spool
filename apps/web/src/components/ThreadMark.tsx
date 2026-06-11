interface Props {
  size?: number;
}

/** The Skein wordmark glyph: a woven thread through three nodes. */
export function ThreadMark({ size = 28 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M4 20 C 10 8, 14 8, 16 16 C 18 24, 22 24, 28 12"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="4" cy="20" r="2.6" fill="var(--accent-2)" />
      <circle cx="16" cy="16" r="3" fill="var(--accent)" />
      <circle cx="28" cy="12" r="2.6" fill="var(--accent-2)" />
    </svg>
  );
}
