import { surnameOf, type AuthorCandidate, type Publication } from "@spool/shared";

/** Loose match: the searched author's surname should appear in the author name. */
export function matchesQuery(name: string, query: string): boolean {
  const surname = surnameOf(query).toLowerCase();
  return surname.length > 0 && name.toLowerCase().includes(surname);
}

export function buildCandidates(pubs: Publication[], query: string): AuthorCandidate[] {
  const groups = new Map<string, { affiliation: string | undefined; pubs: Publication[] }>();

  for (const p of pubs) {
    const author = p.authors.find((a) => matchesQuery(a.name, query));
    if (!author) continue;
    const affiliation = author.affiliation?.trim() || undefined;
    const groupKey = affiliation ?? "";
    const existing = groups.get(groupKey) ?? { affiliation, pubs: [] };
    existing.pubs.push(p);
    groups.set(groupKey, existing);
  }

  return [...groups.values()]
    .map(
      (g): AuthorCandidate => ({
        name: query,
        affiliation: g.affiliation,
        paperCount: g.pubs.length,
      }),
    )
    .sort((a, b) => b.paperCount - a.paperCount);
}
