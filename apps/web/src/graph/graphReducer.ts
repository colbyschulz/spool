import { authorId, type Author, type GraphState } from "@skein/shared";

export function initGraph(seed: Author): GraphState {
  const id = authorId(seed);
  return { nodes: [{ id, author: seed }], links: [], seedId: id };
}

export function addCoAuthors(
  state: GraphState,
  fromId: string,
  coAuthors: Author[],
  viaPmid: string,
): GraphState {
  const nodeIds = new Set(state.nodes.map((n) => n.id));
  const linkKeys = new Set(state.links.map((l) => `${l.source}->${l.target}:${l.viaPmid}`));

  const nodes = [...state.nodes];
  const links = [...state.links];

  for (const author of coAuthors) {
    const id = authorId(author);
    if (id === fromId) continue;
    if (!nodeIds.has(id)) {
      nodes.push({ id, author });
      nodeIds.add(id);
    }
    const key = `${fromId}->${id}:${viaPmid}`;
    if (!linkKeys.has(key)) {
      links.push({ source: fromId, target: id, viaPmid });
      linkKeys.add(key);
    }
  }

  return { ...state, nodes, links };
}
