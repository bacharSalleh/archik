import type { Document, Edge, Node } from "./types.ts";

export type DiffStatus = "added" | "removed" | "changed" | "unchanged";

export type FieldChange = {
  field: string;
  before: unknown;
  after: unknown;
};

export type DocumentDiff = {
  nodes: {
    added: Node[];
    removed: Node[];
    changed: Array<{ node: Node; before: Node; changes: FieldChange[] }>;
    unchanged: string[]; // ids only — saves memory for big diagrams
  };
  edges: {
    added: Edge[];
    removed: Edge[];
    changed: Array<{ edge: Edge; before: Edge; changes: FieldChange[] }>;
    unchanged: string[];
  };
};

/**
 * Map every id in `a` and `b` to its diff status. Status is computed
 * by id, then deep field comparison for the both-sides case.
 *
 * `before` and `after` are the documents being compared. The
 * direction is "what would happen if we changed `before` into
 * `after`" — i.e. a node only in `after` is "added".
 */
export function diffDocuments(
  before: Document,
  after: Document,
): DocumentDiff {
  const beforeNodes = new Map(before.nodes.map((n) => [n.id, n] as const));
  const afterNodes = new Map(after.nodes.map((n) => [n.id, n] as const));
  const beforeEdges = new Map(before.edges.map((e) => [e.id, e] as const));
  const afterEdges = new Map(after.edges.map((e) => [e.id, e] as const));

  const nodes: DocumentDiff["nodes"] = {
    added: [],
    removed: [],
    changed: [],
    unchanged: [],
  };
  const edges: DocumentDiff["edges"] = {
    added: [],
    removed: [],
    changed: [],
    unchanged: [],
  };

  for (const [id, node] of afterNodes) {
    const prev = beforeNodes.get(id);
    if (prev === undefined) {
      nodes.added.push(node);
    } else {
      const changes = diffFields(prev, node, NODE_FIELDS);
      if (changes.length === 0) nodes.unchanged.push(id);
      else nodes.changed.push({ node, before: prev, changes });
    }
  }
  for (const [id, node] of beforeNodes) {
    if (!afterNodes.has(id)) nodes.removed.push(node);
  }

  for (const [id, edge] of afterEdges) {
    const prev = beforeEdges.get(id);
    if (prev === undefined) {
      edges.added.push(edge);
    } else {
      const changes = diffFields(prev, edge, EDGE_FIELDS);
      if (changes.length === 0) edges.unchanged.push(id);
      else edges.changed.push({ edge, before: prev, changes });
    }
  }
  for (const [id, edge] of beforeEdges) {
    if (!afterEdges.has(id)) edges.removed.push(edge);
  }

  return { nodes, edges };
}

// Every Node field whose change is user-visible on the canvas.
// Keep this list in sync with `NodeSchema` in `schema.ts` so
// `archik diff` doesn't silently drop attribute changes (e.g. a
// stereotype flip from `boundary` to `control`, or a status flip
// from `proposed` to `active`). Keys NOT in this list (e.g. `id`,
// which would be a delete + add anyway) are intentionally excluded.
const NODE_FIELDS = [
  "kind",
  "name",
  "description",
  "stack",
  "parentId",
  "responsibilities",
  "interfaces",
  "notes",
  "metadata",
  "archikFile",
  "sourcePath",
  "seqFiles",
  "status",
  "stereotype",
] as const;

const EDGE_FIELDS = [
  "from",
  "to",
  "relationship",
  "label",
  "description",
  "protocol",
  "color",
  "fromFile",
  "toFile",
] as const;

function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: ReadonlyArray<keyof T & string>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const a = before[field];
    const b = after[field];
    if (!deepEqual(a, b)) {
      changes.push({ field, before: a, after: b });
    }
  }
  return changes;
}

/**
 * Compose a single Document containing every entity from both inputs,
 * with `after`'s data winning when an id is present in both. Used to
 * feed the layout engine when rendering a visual diff — we want
 * removed entities present so ELK gives them positions, just visually
 * marked as removed when drawn.
 */
export function mergeForDiff(before: Document, after: Document): Document {
  const status = statusMap(diffDocuments(before, after));
  const beforeNodes = new Map(before.nodes.map((n) => [n.id, n] as const));
  const beforeEdges = new Map(before.edges.map((e) => [e.id, e] as const));

  const mergedNodes: Node[] = [];
  for (const node of after.nodes) mergedNodes.push(node);
  for (const node of before.nodes) {
    if (!status.nodes.has(node.id)) continue;
    if (status.nodes.get(node.id) !== "removed") continue;
    // Drop parentId if the parent itself was removed AND not present
    // in the merge; otherwise the schema rejects the dangling ref.
    const parentStillExists =
      node.parentId === undefined ||
      after.nodes.some((n) => n.id === node.parentId) ||
      before.nodes.some(
        (n) =>
          n.id === node.parentId && status.nodes.get(n.id) === "removed",
      );
    mergedNodes.push(
      parentStillExists ? node : { ...node, parentId: undefined },
    );
  }

  const mergedEdges: Edge[] = [];
  for (const edge of after.edges) mergedEdges.push(edge);
  for (const edge of before.edges) {
    if (status.edges.get(edge.id) !== "removed") continue;
    // An edge whose endpoints aren't both present in the merge would
    // fail schema validation. They are present (we just added removed
    // nodes above), so this is safe.
    mergedEdges.push(edge);
  }

  void beforeNodes;
  void beforeEdges;
  return {
    ...after,
    nodes: mergedNodes,
    edges: mergedEdges,
  };
}

export type StatusMap = {
  nodes: Map<string, DiffStatus>;
  edges: Map<string, DiffStatus>;
};

export function statusMap(diff: DocumentDiff): StatusMap {
  const nodes = new Map<string, DiffStatus>();
  const edges = new Map<string, DiffStatus>();
  for (const n of diff.nodes.added) nodes.set(n.id, "added");
  for (const n of diff.nodes.removed) nodes.set(n.id, "removed");
  for (const c of diff.nodes.changed) nodes.set(c.node.id, "changed");
  for (const id of diff.nodes.unchanged) nodes.set(id, "unchanged");
  for (const e of diff.edges.added) edges.set(e.id, "added");
  for (const e of diff.edges.removed) edges.set(e.id, "removed");
  for (const c of diff.edges.changed) edges.set(c.edge.id, "changed");
  for (const id of diff.edges.unchanged) edges.set(id, "unchanged");
  return { nodes, edges };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  const bKeys = Object.keys(bo);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}
