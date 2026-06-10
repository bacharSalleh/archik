/**
 * Semantic three-way merge for archik documents — the engine behind
 * `archik merge-driver`. Plain `git merge` treats the YAML as text
 * and conflicts whenever two branches touch adjacent lines; since
 * nodes and edges are id-keyed, almost all of those conflicts are
 * resolvable mechanically:
 *
 *   - both sides added different entities       → keep both
 *   - one side changed, the other didn't        → take the change
 *   - both changed DIFFERENT fields of one id   → merge field-wise
 *   - one side deleted, the other didn't touch  → delete
 *
 * What's left is a true conflict (same field of the same entity
 * changed differently, or modify-vs-delete). Conflicts keep the
 * `ours` value in the output and are reported so the caller can
 * exit 1 and let the user decide.
 *
 * Pure function — file I/O, YAML, and git semantics live in the CLI
 * wrapper.
 */
import type { Document, Edge, Node } from "./types.ts";

export type MergeConflict = {
  entity: "node" | "edge" | "document";
  /** Entity id, or the document field name for document-level conflicts. */
  id: string;
  field: string;
  base: unknown;
  ours: unknown;
  theirs: unknown;
};

export type MergeOutcome = {
  doc: Document;
  conflicts: MergeConflict[];
};

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    if (ka.length !== kb.length) return false;
    return ka.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    );
  }
  return false;
}

/**
 * Field-wise merge of one entity that exists on both sides. For each
 * field across all three versions: agreement wins, then "only one
 * side moved" wins, otherwise it's a conflict and `ours` is kept.
 */
function mergeEntity<T extends Record<string, unknown>>(
  entity: "node" | "edge",
  id: string,
  base: T | undefined,
  ours: T,
  theirs: T,
  conflicts: MergeConflict[],
): T {
  if (deepEqual(ours, theirs)) return ours;
  const fields = new Set([
    ...Object.keys(ours),
    ...Object.keys(theirs),
    ...(base !== undefined ? Object.keys(base) : []),
  ]);
  const merged: Record<string, unknown> = {};
  for (const field of fields) {
    const b = base?.[field];
    const o = ours[field];
    const t = theirs[field];
    let value: unknown;
    if (deepEqual(o, t)) value = o;
    else if (deepEqual(b, o)) value = t; // only theirs moved
    else if (deepEqual(b, t)) value = o; // only ours moved
    else {
      value = o;
      conflicts.push({ entity, id, field, base: b, ours: o, theirs: t });
    }
    if (value !== undefined) merged[field] = value;
  }
  return merged as T;
}

/**
 * Merge one id-keyed collection. Output order: ours order first
 * (including ours-only additions in place), then theirs-only
 * additions appended in theirs order.
 */
function mergeCollection<T extends { id: string }>(
  entity: "node" | "edge",
  base: T[],
  ours: T[],
  theirs: T[],
  conflicts: MergeConflict[],
): T[] {
  const byId = (list: T[]): Map<string, T> =>
    new Map(list.map((e) => [e.id, e]));
  const b = byId(base);
  const o = byId(ours);
  const t = byId(theirs);

  const out: T[] = [];
  for (const entry of ours) {
    const theirEntry = t.get(entry.id);
    const baseEntry = b.get(entry.id);
    if (theirEntry !== undefined) {
      out.push(
        mergeEntity(
          entity,
          entry.id,
          baseEntry as Record<string, unknown> | undefined,
          entry as unknown as Record<string, unknown>,
          theirEntry as unknown as Record<string, unknown>,
          conflicts,
        ) as unknown as T,
      );
      continue;
    }
    if (baseEntry === undefined) {
      out.push(entry); // ours added it
      continue;
    }
    if (deepEqual(baseEntry, entry)) {
      continue; // theirs deleted it, we didn't touch it → deletion wins
    }
    // We modified it, theirs deleted it → conflict; keep ours.
    conflicts.push({
      entity,
      id: entry.id,
      field: "(modified here, deleted on the other side)",
      base: baseEntry,
      ours: entry,
      theirs: undefined,
    });
    out.push(entry);
  }
  for (const entry of theirs) {
    if (o.has(entry.id)) continue; // already handled above
    const baseEntry = b.get(entry.id);
    if (baseEntry === undefined) {
      out.push(entry); // theirs added it
      continue;
    }
    if (deepEqual(baseEntry, entry)) {
      continue; // we deleted it, theirs didn't touch it → deletion wins
    }
    // Theirs modified it, we deleted it → conflict; keep theirs so
    // the change isn't silently lost.
    conflicts.push({
      entity,
      id: entry.id,
      field: "(deleted here, modified on the other side)",
      base: baseEntry,
      ours: undefined,
      theirs: entry,
    });
    out.push(entry);
  }
  return out;
}

export function mergeDocuments(
  base: Document,
  ours: Document,
  theirs: Document,
): MergeOutcome {
  const conflicts: MergeConflict[] = [];

  // Document-level scalar fields share the entity field logic.
  const docFields = ["name", "description", "metadata"] as const;
  const head: Record<string, unknown> = { version: ours.version };
  for (const field of docFields) {
    const b = base[field];
    const o = ours[field];
    const t = theirs[field];
    let value: unknown;
    if (deepEqual(o, t)) value = o;
    else if (deepEqual(b, o)) value = t;
    else if (deepEqual(b, t)) value = o;
    else {
      value = o;
      conflicts.push({
        entity: "document",
        id: field,
        field,
        base: b,
        ours: o,
        theirs: t,
      });
    }
    if (value !== undefined) head[field] = value;
  }

  const nodes = mergeCollection<Node>(
    "node",
    base.nodes,
    ours.nodes,
    theirs.nodes,
    conflicts,
  );
  const edges = mergeCollection<Edge>(
    "edge",
    base.edges,
    ours.edges,
    theirs.edges,
    conflicts,
  );

  const doc = { ...head, nodes, edges } as Document;
  return { doc, conflicts };
}
