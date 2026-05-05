// Kinship calculator: walks the relationships graph and labels the connection.
// Edge convention (matches how data is stored in the join flow):
//   relationships(member_id_1=A, member_id_2=B, type=T)  ⇒  "B is T to A"
// So traversing A→B exposes type T; traversing B→A exposes the inverse.

import { RELATIONSHIP_OPTIONS, relationshipLabel } from "./relationships";

export type EdgeRow = {
  member_id_1: string;
  member_id_2: string;
  relationship_type: string;
};

type DirEdge = { to: string; type: string };

// Inverse: "B is X to A" ⇒ "A is INVERSE[X] to B"
const INVERSE: Record<string, string> = {
  father: "son",
  mother: "son",
  son: "father",
  daughter: "father",
  brother: "brother",
  sister: "sister",
  husband: "wife",
  wife: "husband",
  uncle_paternal: "nephew",
  uncle_maternal: "nephew",
  aunt_paternal: "niece",
  aunt_maternal: "niece",
  nephew: "uncle_paternal",
  niece: "aunt_paternal",
  cousin_male: "cousin_male",
  cousin_female: "cousin_female",
  grandfather: "grandson",
  grandmother: "granddaughter",
  grandson: "grandfather",
  granddaughter: "grandmother",
  father_in_law: "son_in_law",
  mother_in_law: "daughter_in_law",
  son_in_law: "father_in_law",
  daughter_in_law: "mother_in_law",
  brother_in_law: "brother_in_law",
  sister_in_law: "sister_in_law",
  other: "other",
};

// Composition table: A→B is `a`, B→C is `b`  ⇒  A→C is COMPOSE[a][b]
const COMPOSE: Record<string, Record<string, string>> = {
  father: {
    father: "grandfather",
    mother: "grandmother",
    brother: "uncle_paternal",
    sister: "aunt_paternal",
    son: "brother",
    daughter: "sister",
    wife: "mother",
  },
  mother: {
    father: "grandfather",
    mother: "grandmother",
    brother: "uncle_maternal",
    sister: "aunt_maternal",
    son: "brother",
    daughter: "sister",
    husband: "father",
  },
  son: {
    son: "grandson",
    daughter: "granddaughter",
    wife: "daughter_in_law",
  },
  daughter: {
    son: "grandson",
    daughter: "granddaughter",
    husband: "son_in_law",
  },
  brother: {
    son: "nephew",
    daughter: "niece",
    wife: "sister_in_law",
  },
  sister: {
    son: "nephew",
    daughter: "niece",
    husband: "brother_in_law",
  },
  husband: {
    father: "father_in_law",
    mother: "mother_in_law",
    brother: "brother_in_law",
    sister: "sister_in_law",
    son: "son",
    daughter: "daughter",
  },
  wife: {
    father: "father_in_law",
    mother: "mother_in_law",
    brother: "brother_in_law",
    sister: "sister_in_law",
    son: "son",
    daughter: "daughter",
  },
  uncle_paternal: { son: "cousin_male", daughter: "cousin_female" },
  uncle_maternal: { son: "cousin_male", daughter: "cousin_female" },
  aunt_paternal: { son: "cousin_male", daughter: "cousin_female" },
  aunt_maternal: { son: "cousin_male", daughter: "cousin_female" },
  grandfather: { brother: "grandfather", sister: "grandmother" },
  grandmother: { brother: "grandfather", sister: "grandmother" },
};

export function buildGraph(edges: EdgeRow[]): Map<string, DirEdge[]> {
  const g = new Map<string, DirEdge[]>();
  const push = (from: string, to: string, type: string) => {
    if (!g.has(from)) g.set(from, []);
    g.get(from)!.push({ to, type });
  };
  for (const e of edges) {
    push(e.member_id_1, e.member_id_2, e.relationship_type);
    push(e.member_id_2, e.member_id_1, INVERSE[e.relationship_type] ?? "other");
  }
  return g;
}

export type KinshipResult = {
  found: boolean;
  /** machine relationship type if it could be reduced to a known label, else null */
  type: string | null;
  /** human-readable relationship from `from` to `to` */
  label: string;
  /** raw chain of types (each step is "to is X to from") */
  chain: string[];
  /** member ids on the path */
  path: string[];
};

/** BFS shortest path between two member ids. */
function shortestPath(g: Map<string, DirEdge[]>, from: string, to: string): { path: string[]; chain: string[] } | null {
  if (from === to) return { path: [from], chain: [] };
  const prev = new Map<string, { node: string; type: string }>();
  const visited = new Set<string>([from]);
  const queue: string[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const edge of g.get(cur) ?? []) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      prev.set(edge.to, { node: cur, type: edge.type });
      if (edge.to === to) {
        const path: string[] = [];
        const chain: string[] = [];
        let n = to;
        while (n !== from) {
          const p = prev.get(n)!;
          path.unshift(n);
          chain.unshift(p.type);
          n = p.node;
        }
        path.unshift(from);
        return { path, chain };
      }
      queue.push(edge.to);
    }
  }
  return null;
}

/** Try to fold a chain of type-steps into a single known type. */
function reduceChain(chain: string[]): string | null {
  if (chain.length === 0) return null;
  if (chain.length === 1) return chain[0];
  let acc = chain[0];
  for (let i = 1; i < chain.length; i++) {
    const next = COMPOSE[acc]?.[chain[i]];
    if (!next) return null;
    acc = next;
  }
  return acc;
}

export function describeChain(chain: string[]): string {
  // e.g. ["father","brother"] → "otangizning akasi/ukasi"
  // We use the standard label and chain with " → " for clarity.
  if (chain.length === 0) return "—";
  return chain.map(relationshipLabel).join(" → ");
}

export function calculateKinship(edges: EdgeRow[], fromId: string, toId: string): KinshipResult {
  if (fromId === toId) {
    return { found: true, type: null, label: "Bu o'sha shaxs", chain: [], path: [fromId] };
  }
  const g = buildGraph(edges);
  const sp = shortestPath(g, fromId, toId);
  if (!sp) {
    return { found: false, type: null, label: "Aloqa topilmadi", chain: [], path: [] };
  }
  const reduced = reduceChain(sp.chain);
  if (reduced) {
    return {
      found: true,
      type: reduced,
      label: relationshipLabel(reduced),
      chain: sp.chain,
      path: sp.path,
    };
  }
  return {
    found: true,
    type: null,
    label: describeChain(sp.chain),
    chain: sp.chain,
    path: sp.path,
  };
}

export const KINSHIP_LABELS = RELATIONSHIP_OPTIONS;
