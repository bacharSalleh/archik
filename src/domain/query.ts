/**
 * Pure query functions over a set of loaded archik documents.
 * No I/O, no formatting — feed in `LoadedDoc[]`, get back structured
 * answers. The CLI (`archik q ...`) is the human/JSON-shaping layer
 * on top of these.
 */
import type { Edge, Node, NodeKind, Relationship } from "./types.ts";
import type { LoadedDoc } from "../io/discovery.ts";

export type FoundNode = { node: Node; relPath: string };
export type FoundEdge = { edge: Edge; relPath: string };

export type FindResult =
  | { ok: true; found: FoundNode }
  | { ok: false; error: string };

/**
 * Locate a node by id. Errors when the same id appears in multiple
 * files — silent picks lead to silent bugs. The schema enforces
 * uniqueness *within* a file; cross-file uniqueness is not enforced
 * because legitimate cross-file references exist (a node id that's
 * intentionally referenced from another file via fromFile/toFile).
 * For querying, though, ambiguity is unsafe — surface it.
 */
export function findNode(docs: LoadedDoc[], id: string): FindResult {
  const matches: FoundNode[] = [];
  for (const { doc, relPath } of docs) {
    for (const node of doc.nodes) {
      if (node.id === id) matches.push({ node, relPath });
    }
  }
  if (matches.length === 0) {
    return { ok: false, error: `no node with id "${id}"` };
  }
  if (matches.length > 1) {
    const paths = matches.map((m) => m.relPath).join(", ");
    return {
      ok: false,
      error: `node id "${id}" appears in multiple files: ${paths}`,
    };
  }
  return { ok: true, found: matches[0]! };
}

/** Outgoing edges from a node — what it depends on / calls / writes / etc. */
export function deps(docs: LoadedDoc[], id: string): FoundEdge[] {
  const out: FoundEdge[] = [];
  for (const { doc, relPath } of docs) {
    for (const edge of doc.edges) {
      if (edge.from === id) out.push({ edge, relPath });
    }
  }
  return out;
}

/** Incoming edges to a node — what depends on / calls / reads from it. */
export function dependents(docs: LoadedDoc[], id: string): FoundEdge[] {
  const out: FoundEdge[] = [];
  for (const { doc, relPath } of docs) {
    for (const edge of doc.edges) {
      if (edge.to === id) out.push({ edge, relPath });
    }
  }
  return out;
}

export type NodeFilters = {
  kind?: NodeKind;
  parent?: string;
  /** Substring match against the file's basename (without extensions),
   *  or against the relPath as a whole. Lets `--file payments` match
   *  `.archik/payments.archik.yaml`. */
  file?: string;
};

export function listNodes(
  docs: LoadedDoc[],
  filters: NodeFilters,
): FoundNode[] {
  const out: FoundNode[] = [];
  for (const { doc, relPath } of docs) {
    if (filters.file !== undefined && !relPath.includes(filters.file)) {
      continue;
    }
    for (const node of doc.nodes) {
      if (filters.kind !== undefined && node.kind !== filters.kind) continue;
      if (filters.parent !== undefined && node.parentId !== filters.parent) {
        continue;
      }
      out.push({ node, relPath });
    }
  }
  return out;
}

export type EdgeFilters = {
  from?: string;
  to?: string;
  rel?: Relationship;
};

export function listEdges(
  docs: LoadedDoc[],
  filters: EdgeFilters,
): FoundEdge[] {
  const out: FoundEdge[] = [];
  for (const { doc, relPath } of docs) {
    for (const edge of doc.edges) {
      if (filters.from !== undefined && edge.from !== filters.from) continue;
      if (filters.to !== undefined && edge.to !== filters.to) continue;
      if (filters.rel !== undefined && edge.relationship !== filters.rel) {
        continue;
      }
      out.push({ edge, relPath });
    }
  }
  return out;
}

export type Stats = {
  files: number;
  nodes: number;
  edges: number;
  kinds: Record<string, number>;
  relationships: Record<string, number>;
};

export function stats(docs: LoadedDoc[]): Stats {
  const kinds: Record<string, number> = {};
  const relationships: Record<string, number> = {};
  let nodes = 0;
  let edges = 0;
  for (const { doc } of docs) {
    nodes += doc.nodes.length;
    edges += doc.edges.length;
    for (const n of doc.nodes) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;
    for (const e of doc.edges) {
      relationships[e.relationship] = (relationships[e.relationship] ?? 0) + 1;
    }
  }
  return { files: docs.length, nodes, edges, kinds, relationships };
}

export type Impact = {
  /** Edges that would point at the removed node from any side. */
  danglingEdges: FoundEdge[];
  /** Direct children (nodes whose parentId equals the removed node). */
  children: FoundNode[];
  /** Every node that can reach the target via outgoing edges
   *  (transitive). Useful for "what breaks if I remove X". */
  transitiveDependents: FoundNode[];
};

export function impact(docs: LoadedDoc[], id: string): Impact {
  // Edges where either endpoint is the target — these would dangle.
  const danglingEdges: FoundEdge[] = [];
  // Direct children via parentId.
  const children: FoundNode[] = [];
  for (const { doc, relPath } of docs) {
    for (const edge of doc.edges) {
      if (edge.from === id || edge.to === id) {
        danglingEdges.push({ edge, relPath });
      }
    }
    for (const node of doc.nodes) {
      if (node.parentId === id) children.push({ node, relPath });
    }
  }

  // Transitive: walk the reverse-edge graph from target.
  const inbound = new Map<string, string[]>();
  const nodeIndex = new Map<string, FoundNode>();
  for (const { doc, relPath } of docs) {
    for (const node of doc.nodes) nodeIndex.set(node.id, { node, relPath });
    for (const edge of doc.edges) {
      const list = inbound.get(edge.to) ?? [];
      list.push(edge.from);
      inbound.set(edge.to, list);
    }
  }
  // BFS over reverse edges. Seed with the target so we don't re-walk
  // it, then add only the *reachable* ids — the target itself is
  // never a "dependent of itself", even if a cycle reaches it.
  const visited = new Set<string>([id]);
  const reached = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const from of inbound.get(cur) ?? []) {
      if (visited.has(from)) continue;
      visited.add(from);
      reached.add(from);
      stack.push(from);
    }
  }
  const transitiveDependents: FoundNode[] = [];
  for (const dep of reached) {
    const found = nodeIndex.get(dep);
    if (found !== undefined) transitiveDependents.push(found);
  }

  return { danglingEdges, children, transitiveDependents };
}
