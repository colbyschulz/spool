import type {
  ApiError,
  AuthorCandidate,
  AuthorPublicationsResponse,
  Publication,
  SearchAuthorsResponse,
} from "@spool/shared";

/** Non-2xx API response, carrying the typed error body when the server sent one. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly detail?: ApiError;

  constructor(status: number, detail?: ApiError) {
    super(detail?.message ?? `Request failed: ${status}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.detail = detail;
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    let detail: ApiError | undefined;
    try {
      detail = (await res.json()) as ApiError;
    } catch {
      // non-JSON error body
    }
    throw new ApiRequestError(res.status, detail);
  }
  return (await res.json()) as T;
}

export async function searchAuthors(
  name: string,
  signal?: AbortSignal,
): Promise<AuthorCandidate[]> {
  const data = await getJson<SearchAuthorsResponse>(
    `/api/authors/search?name=${encodeURIComponent(name)}`,
    signal,
  );
  return data.candidates;
}

export async function getAuthorPublications(
  name: string,
  affiliation?: string,
  signal?: AbortSignal,
): Promise<Publication[]> {
  const params = new URLSearchParams({ name });
  if (affiliation) params.set("affiliation", affiliation);
  const data = await getJson<AuthorPublicationsResponse>(
    `/api/authors/publications?${params.toString()}`,
    signal,
  );
  return data.publications;
}
