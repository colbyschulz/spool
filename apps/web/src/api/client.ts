import type { AuthorCandidate, Publication } from "@spool/shared";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function searchAuthors(name: string): Promise<AuthorCandidate[]> {
  const data = await getJson<{ candidates: AuthorCandidate[] }>(
    `/api/authors/search?name=${encodeURIComponent(name)}`,
  );
  return data.candidates;
}

export async function getAuthorPublications(
  name: string,
  affiliation?: string,
): Promise<Publication[]> {
  const params = new URLSearchParams({ name });
  if (affiliation) params.set("affiliation", affiliation);
  const data = await getJson<{ publications: Publication[] }>(
    `/api/authors/publications?${params.toString()}`,
  );
  return data.publications;
}

export async function getPublication(pmid: string): Promise<Publication> {
  const data = await getJson<{ publication: Publication }>(`/api/publications/${pmid}`);
  return data.publication;
}
