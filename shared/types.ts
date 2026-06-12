export interface Author {
  /** Display name, e.g. "Jane R Smith". */
  name: string;
  /** Affiliation string from the record, when present. */
  affiliation?: string;
}

export interface Publication {
  pmid: string;
  title: string;
  journal: string;
  /** Publication year, e.g. 2023. May be undefined if PubMed omits it. */
  year?: number;
  authors: Author[];
  pubmedUrl: string;
}

/** A disambiguation candidate: one likely person behind a name query. */
export interface AuthorCandidate {
  name: string;
  /** Undefined when the records list no affiliation for this person. */
  affiliation?: string;
  paperCount: number;
}

/** Response envelope for GET /api/authors/search. */
export interface SearchAuthorsResponse {
  candidates: AuthorCandidate[];
}

/** Response envelope for GET /api/authors/publications. */
export interface AuthorPublicationsResponse {
  publications: Publication[];
}

/** Response envelope for GET /api/publications/:pmid. */
export interface GetPublicationResponse {
  publication: Publication;
}

/** Error body returned by every non-2xx API response. */
export interface ApiError {
  error: string;
  message?: string;
}

/**
 * First whitespace token of a PubMed-style name ("Smith J" -> "Smith").
 * Assumes PubMed short form, not inverted "Smith, J" (the comma would be kept).
 */
export function surnameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** Canonical affiliation form for identity/equality: lowercased, trimmed, whitespace-collapsed. */
export function normalizeAffiliation(affiliation: string | undefined): string {
  return (affiliation ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Stable identity key for an author node: normalized name + affiliation. */
export function authorId(author: Author): string {
  const name = author.name.trim().toLowerCase().replace(/\s+/g, " ");
  const aff = normalizeAffiliation(author.affiliation);
  return aff ? `${name}|${aff}` : name;
}
