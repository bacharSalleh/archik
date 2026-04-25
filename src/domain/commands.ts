import { DocumentSchema } from "./schema.ts";
import type { Document, Edge, Node } from "./types.ts";

export type Command =
  | { type: "add_node"; node: Node }
  | { type: "remove_node"; id: string }
  | { type: "update_node"; id: string; patch: Partial<Node> }
  | { type: "connect"; edge: Edge }
  | { type: "disconnect"; id: string }
  | { type: "update_edge"; id: string; patch: Partial<Edge> }
  | { type: "rename_document"; name: string };

export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandError";
  }
}

function findNode(doc: Document, id: string): Node | undefined {
  return doc.nodes.find((n) => n.id === id);
}

function addNode(doc: Document, node: Node): Document {
  if (findNode(doc, node.id)) {
    throw new CommandError(`node id "${node.id}" already exists`);
  }
  if (node.parentId !== undefined && !findNode(doc, node.parentId)) {
    throw new CommandError(
      `node "${node.id}" references missing parent "${node.parentId}"`,
    );
  }
  return { ...doc, nodes: [...doc.nodes, node] };
}

function removeNode(doc: Document, id: string): Document {
  if (!findNode(doc, id)) {
    throw new CommandError(`node "${id}" does not exist`);
  }
  const child = doc.nodes.find((n) => n.parentId === id);
  if (child) {
    throw new CommandError(
      `cannot remove "${id}": "${child.id}" still references it as parent`,
    );
  }
  return {
    ...doc,
    nodes: doc.nodes.filter((n) => n.id !== id),
    edges: doc.edges.filter((e) => e.from !== id && e.to !== id),
  };
}

function wouldCreateParentCycle(
  doc: Document,
  nodeId: string,
  proposedParent: string,
): boolean {
  let cursor: string | undefined = proposedParent;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === nodeId) return true;
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = doc.nodes.find((n) => n.id === cursor)?.parentId;
  }
  return false;
}

function updateNode(
  doc: Document,
  id: string,
  patch: Partial<Node>,
): Document {
  const existing = findNode(doc, id);
  if (!existing) {
    throw new CommandError(`node "${id}" does not exist`);
  }
  if ("id" in patch && patch.id !== undefined && patch.id !== id) {
    throw new CommandError(`update_node cannot change id (${id} → ${patch.id})`);
  }
  if (patch.parentId !== undefined) {
    if (patch.parentId === id) {
      throw new CommandError(`node "${id}" cannot be its own parent`);
    }
    if (!findNode(doc, patch.parentId)) {
      throw new CommandError(
        `node "${id}" references missing parent "${patch.parentId}"`,
      );
    }
    if (wouldCreateParentCycle(doc, id, patch.parentId)) {
      throw new CommandError(
        `setting parent of "${id}" to "${patch.parentId}" would create a parent cycle`,
      );
    }
  }
  const merged: Node = { ...existing, ...patch, id };
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === id ? merged : n)),
  };
}

function connect(doc: Document, edge: Edge): Document {
  if (doc.edges.some((e) => e.id === edge.id)) {
    throw new CommandError(`edge id "${edge.id}" already exists`);
  }
  if (!findNode(doc, edge.from)) {
    throw new CommandError(`edge "${edge.id}" references missing from "${edge.from}"`);
  }
  if (!findNode(doc, edge.to)) {
    throw new CommandError(`edge "${edge.id}" references missing to "${edge.to}"`);
  }
  return { ...doc, edges: [...doc.edges, edge] };
}

function disconnect(doc: Document, id: string): Document {
  if (!doc.edges.some((e) => e.id === id)) {
    throw new CommandError(`edge "${id}" does not exist`);
  }
  return { ...doc, edges: doc.edges.filter((e) => e.id !== id) };
}

function updateEdge(
  doc: Document,
  id: string,
  patch: Partial<Edge>,
): Document {
  const existing = doc.edges.find((e) => e.id === id);
  if (!existing) {
    throw new CommandError(`edge "${id}" does not exist`);
  }
  if ("id" in patch && patch.id !== undefined && patch.id !== id) {
    throw new CommandError(`update_edge cannot change id (${id} → ${patch.id})`);
  }
  if (patch.from !== undefined && !findNode(doc, patch.from)) {
    throw new CommandError(
      `edge "${id}" references missing from "${patch.from}"`,
    );
  }
  if (patch.to !== undefined && !findNode(doc, patch.to)) {
    throw new CommandError(
      `edge "${id}" references missing to "${patch.to}"`,
    );
  }
  const merged: Edge = { ...existing, ...patch, id };
  return {
    ...doc,
    edges: doc.edges.map((e) => (e.id === id ? merged : e)),
  };
}

function reduce(doc: Document, cmd: Command): Document {
  switch (cmd.type) {
    case "add_node":
      return addNode(doc, cmd.node);
    case "remove_node":
      return removeNode(doc, cmd.id);
    case "update_node":
      return updateNode(doc, cmd.id, cmd.patch);
    case "connect":
      return connect(doc, cmd.edge);
    case "disconnect":
      return disconnect(doc, cmd.id);
    case "update_edge":
      return updateEdge(doc, cmd.id, cmd.patch);
    case "rename_document":
      return { ...doc, name: cmd.name };
    default: {
      const _exhaustive: never = cmd;
      void _exhaustive;
      throw new CommandError(`unhandled command`);
    }
  }
}

export function applyCommand(doc: Document, cmd: Command): Document {
  const next = reduce(doc, cmd);
  return DocumentSchema.parse(next);
}
