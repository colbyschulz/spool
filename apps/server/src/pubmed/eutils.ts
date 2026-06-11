const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function withKey(url: URL): URL {
  const key = process.env.SPOOL_NCBI_API_KEY;
  if (key) url.searchParams.set("api_key", key);
  return url;
}

export function esearchUrl(authorName: string, retmax: number): string {
  const u = new URL(`${BASE}/esearch.fcgi`);
  u.searchParams.set("db", "pubmed");
  u.searchParams.set("term", `${authorName}[Author]`);
  u.searchParams.set("retmax", String(retmax));
  u.searchParams.set("retmode", "json");
  u.searchParams.set("sort", "pub+date"); // newest first — better affiliation data
  return withKey(u).toString();
}

export function efetchUrl(pmids: string[]): string {
  const u = new URL(`${BASE}/efetch.fcgi`);
  u.searchParams.set("db", "pubmed");
  u.searchParams.set("id", pmids.join(","));
  u.searchParams.set("retmode", "xml");
  return withKey(u).toString();
}
