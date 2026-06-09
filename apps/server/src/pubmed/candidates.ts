import type { AuthorCandidate, Publication } from "@skein/shared";

const UNKNOWN = "Unknown affiliation";

function matchesQuery(name: string, query: string): boolean {
  // Loose match: the searched author's surname should appear in the author name.
  const surname = query.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return surname.length > 0 && name.toLowerCase().includes(surname);
}

export function buildCandidates(pubs: Publication[], query: string): AuthorCandidate[] {
  const groups = new Map<string, { affiliation: string; pubs: Publication[] }>();

  for (const p of pubs) {
    const author = p.authors.find((a) => matchesQuery(a.name, query));
    if (!author) continue;
    const affiliation = author.affiliation?.trim() || UNKNOWN;
    const existing = groups.get(affiliation) ?? { affiliation, pubs: [] };
    existing.pubs.push(p);
    groups.set(affiliation, existing);
  }

  return [...groups.values()]
    .map((g): AuthorCandidate => ({
      name: query,
      affiliation: g.affiliation,
      paperCount: g.pubs.length,
      samplePublications: g.pubs.slice(0, 3),
    }))
    .sort((a, b) => b.paperCount - a.paperCount);
}
