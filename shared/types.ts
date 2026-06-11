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
  affiliation: string;
  paperCount: number;
  samplePublications: Publication[];
}

/** A node in the collaboration graph. `id` is the stable author identity key. */
export interface GraphNode {
  id: string;
  author: Author;
  /** Id of the node through which this node was added; null for the seed. */
  parentId?: string | null;
}

export interface GraphLink {
  source: string;
  target: string;
  /** PMID of the paper that established this co-authorship edge. */
  viaPmid: string;
  /** Publication title, used as edge label. */
  viaTitle?: string;
}

export interface GraphState {
  nodes: GraphNode[];
  links: GraphLink[];
  seedId: string;
}

/** Stable identity key for an author node: normalized name + affiliation. */
export function authorId(author: Author): string {
  const name = author.name.trim().toLowerCase().replace(/\s+/g, " ");
  const aff = (author.affiliation ?? "").trim().toLowerCase();
  return aff ? `${name}|${aff}` : name;
}
