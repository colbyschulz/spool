const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function identityParams(u: URL): void {
  u.searchParams.set("tool", "spool");
  const email = process.env.NCBI_CONTACT_EMAIL;
  if (email) u.searchParams.set("email", email);
  const key = process.env.NCBI_API_KEY;
  if (key) u.searchParams.set("api_key", key);
}

export function esearchUrl(authorName: string, retmax: number): string {
  const u = new URL(`${BASE}/esearch.fcgi`);
  u.searchParams.set("db", "pubmed");
  u.searchParams.set("term", `${authorName.trim()}[Author]`);
  u.searchParams.set("retmax", String(retmax));
  u.searchParams.set("retmode", "json");
  u.searchParams.set("sort", "pub_date"); // newest first — better affiliation data
  identityParams(u);
  return u.toString();
}

export function efetchUrl(pmids: string[]): string {
  const u = new URL(`${BASE}/efetch.fcgi`);
  u.searchParams.set("db", "pubmed");
  u.searchParams.set("id", pmids.join(","));
  u.searchParams.set("retmode", "xml");
  identityParams(u);
  return u.toString();
}
