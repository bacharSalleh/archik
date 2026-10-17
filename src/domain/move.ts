/**
 * Move a node into another container (or to the top level) — the
 * "move a box" gesture on the canvas.
 *
 * When a built node moves under a parent whose code lives in a folder,
 * its code has to follow: the node's sourcePath is pointed into the new
 * parent's folder and it becomes `proposed` (a pending move). `archik
 * gap` then tells the agent to move the code, and the node flips back
 * to active once it has.
 *
 * Pure: returns a new document or an error to show the user.
 */
import type { Document, Node } from "./types.ts";

export type MoveResult =
  | { ok: true; doc: Document; plannedMove: { from: string; to: string } | null }
  | { ok: false; error: string };

const looksLikeDirectory = (p: string): boolean => !/\.[a-z0-9]+$/i.test(p.split("/").pop() ?? "");

export function moveNode(doc: Document, id: string, newParentId: string | undefined): MoveResult {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const node = byId.get(id);
  if (node === undefined) return { ok: false, error: `no node "${id}"` };
  if (node.parentId === newParentId) return { ok: true, doc, plannedMove: null };

  // New ancestor chain, refusing cycles.
  const ancestors: string[] = [];
  let cur = newParentId;
  while (cur !== undefined) {
    if (cur === id) return { ok: false, error: `cannot move "${id}" inside itself or one of its own children` };
    ancestors.push(cur);
    cur = byId.get(cur)?.parentId;
    if (ancestors.length > doc.nodes.length) break;
  }

  // The schema forbids edges between a node (or its children) and its
  // containers — the box already says "inside".
  const subtree = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of doc.nodes) {
      if (n.parentId !== undefined && subtree.has(n.parentId) && !subtree.has(n.id)) {
        subtree.add(n.id);
        grew = true;
      }
    }
  }
  const anc = new Set(ancestors);
  const clash = doc.edges.find(
    (e) => (subtree.has(e.from) && anc.has(e.to)) || (subtree.has(e.to) && anc.has(e.from)),
  );
  if (clash !== undefined) {
    return {
      ok: false,
      error: `edge "${clash.id}" (${clash.from} → ${clash.to}) would connect "${id}" to its own container — remove the edge first`,
    };
  }

  let plannedMove: { from: string; to: string } | null = null;
  const parentPath = newParentId === undefined ? undefined : byId.get(newParentId)?.sourcePath?.replace(/\/+$/, "");
  const patch: Partial<Node> = { parentId: newParentId };
  if (
    node.sourcePath !== undefined &&
    parentPath !== undefined &&
    looksLikeDirectory(parentPath) &&
    !(node.sourcePath === parentPath || node.sourcePath.startsWith(parentPath + "/"))
  ) {
    const base = node.sourcePath.replace(/\/+$/, "").split("/").pop()!;
    const to = `${parentPath}/${base}`;
    plannedMove = { from: node.sourcePath, to };
    patch.sourcePath = to;
    patch.status = "proposed";
  }

  const nodes = doc.nodes.map((n) => {
    if (n.id !== id) return n;
    const next: Node = { ...n, ...patch };
    if (newParentId === undefined) delete next.parentId;
    return next;
  });
  return { ok: true, doc: { ...doc, nodes }, plannedMove };
}
