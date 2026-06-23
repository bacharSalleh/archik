/**
 * Pure view filters over archik documents: neighborhood subgraphs and
 * edge filtering. Shared by the CLI (`q neighbors`, `render --focus`,
 * `render --hide-*`) and the canvas (focus mode, hide weak edges,
 * collapse containers). No I/O, no formatting.
 */
import type { LoadedDoc } from "../io/discovery.ts";
import type { FoundEdge, FoundNode } from "./query.ts";
import type { Document, Edge, Relationship } from "./types.ts";
import { relationshipCategory } from "./relationships.ts";

/**
 * Ids within `depth` hops of `id` (either edge direction), including
 * `id` itself. depth 0 => just the node.
 */
export function neighborIds(
  edges: { from: string; to: string }[],
  id: string,
  depth: number,
): Set<string> {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    const s = adj.get(a) ?? new Set<string>();
    s.add(b);
    adj.set(a, s);
  };
  for (const e of edges) {
    add(e.from, e.to);
    add(e.to, e.from);
  }
  const kept = new Set<string>([id]);
  let frontier = new Set<string>([id]);
  for (let hop = 0; hop < depth; hop++) {
    const next = new Set<string>();
    for (const cur of frontier) {
      for (const nb of adj.get(cur) ?? []) {
        if (!kept.has(nb)) {
          kept.add(nb);
          next.add(nb);
        }
      }
    }
    if (next.size === 0) break;
    frontier = next;
  }
  return kept;
}

/** CLI multi-doc neighborhood. */
export function subgraph(
  docs: LoadedDoc[],
  id: string,
  depth: number,
): { nodes: FoundNode[]; edges: FoundEdge[] } {
  const allEdges = docs.flatMap((d) => d.doc.edges);
  const kept = neighborIds(allEdges, id, depth);
  const nodes: FoundNode[] = [];
  const edges: FoundEdge[] = [];
  for (const { doc, relPath } of docs) {
    for (const node of doc.nodes) {
      if (kept.has(node.id)) nodes.push({ node, relPath });
    }
    for (const edge of doc.edges) {
      if (kept.has(edge.from) && kept.has(edge.to)) edges.push({ edge, relPath });
    }
  }
  return { nodes, edges };
}

/** Single-doc neighborhood (canvas). */
export function subgraphDoc(doc: Document, id: string, depth: number): Document {
  const kept = neighborIds(doc.edges, id, depth);
  return {
    ...doc,
    nodes: doc.nodes.filter((n) => kept.has(n.id)),
    edges: doc.edges.filter((e) => kept.has(e.from) && kept.has(e.to)),
  };
}

export type EdgeView = {
  hideRel?: Relationship[];
  onlyRel?: Relationship[];
  hideStructural?: boolean;
};

export function applyEdgeView(doc: Document, view: EdgeView): Document {
  const hide = new Set(view.hideRel ?? []);
  const only = view.onlyRel ? new Set(view.onlyRel) : null;
  const edges = doc.edges.filter((e) => {
    if (only && !only.has(e.relationship)) return false;
    if (hide.has(e.relationship)) return false;
    if (view.hideStructural && relationshipCategory(e.relationship) === "structural") {
      return false;
    }
    return true;
  });
  return { ...doc, edges };
}

/**
 * Collapse the given containers: hide every descendant, re-point edges
 * that crossed a collapsed boundary to the nearest collapsed ancestor,
 * drop resulting self-loops, and dedup by (from, to, relationship).
 */
export function collapseContainers(
  doc: Document,
  collapsed: Set<string>,
): Document {
  const parentOf = new Map<string, string | undefined>();
  for (const n of doc.nodes) parentOf.set(n.id, n.parentId);

  // Map each node id to the visible id it renders as: the highest
  // collapsed ancestor, or itself if none of its ancestors is collapsed.
  const visibleId = (id: string): string => {
    let cur: string | undefined = id;
    let result = id;
    const seen = new Set<string>();
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      if (collapsed.has(cur)) result = cur;
      cur = parentOf.get(cur);
    }
    return result;
  };

  // A node is hidden if it has a collapsed ancestor that is not itself.
  const isHidden = (id: string): boolean => visibleId(id) !== id;

  const nodes = doc.nodes.filter((n) => !isHidden(n.id));

  const seen = new Set<string>();
  const edges: Edge[] = [];
  for (const e of doc.edges) {
    const from = visibleId(e.from);
    const to = visibleId(e.to);
    if (from === to) continue; // self-loop after collapse
    const key = `${from}|${to}|${e.relationship}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ ...e, from, to });
  }
  return { ...doc, nodes, edges };
}

export type CanvasView = {
  collapsed: Set<string>;
  hideStructural: boolean;
  focus: { id: string; depth: number } | null;
};

/** Compose the canvas view: collapse → focus → hide structural. */
export function projectCanvasView(doc: Document, view: CanvasView): Document {
  let out = doc;
  if (view.collapsed.size > 0) out = collapseContainers(out, view.collapsed);
  if (view.focus) out = subgraphDoc(out, view.focus.id, view.focus.depth);
  if (view.hideStructural) out = applyEdgeView(out, { hideStructural: true });
  return out;
}
