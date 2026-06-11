import type { Author } from "@skein/shared";

/**
 * Derive up-to-two-letter initials from a PubMed-style name.
 * "Smith JR" -> "SJ", "Maria Del Carmen" -> "MD", "Okafor" -> "OK".
 */
export function initials(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "?";
  if (tokens.length === 1) return tokens[0]!.slice(0, 2).toUpperCase();
  const first = tokens[0]![0]!;
  const second = tokens[tokens.length - 1]![0]!;
  return (first + second).toUpperCase();
}

/** Last name (first whitespace token) for compact node labels. */
export function lastName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Comma-joined author line, truncated to a sensible count. */
export function authorLine(authors: Author[], max = 6): string {
  const names = authors.map((a) => a.name);
  if (names.length <= max) return names.join(", ");
  return names.slice(0, max).join(", ") + `, … (${names.length - max} more)`;
}
