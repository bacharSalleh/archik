/**
 * One-way vs two-way doors — how hard a model change is to undo.
 *
 * A one-way door changes something other code, data or teams will
 * lean on: a new data store, a new external dependency, a new public
 * entry point, a removed component, a moved boundary. Those deserve
 * the full canvas review. Everything else (a new internal function,
 * a description, a lifecycle flip) is a two-way door and can go
 * through one combined review with the build plan.
 *
 * Some one-way doors also carry operational risk — data, external
 * systems, public traffic. For those the decision record must say how
 * the change is secured, observed and rolled back (`crossCutting`).
 *
 * Pure: derived from the before/after documents only.
 */
import { diffDocuments } from "./diff.ts";
import type { Document, Node, NodeKind } from "./types.ts";

/** Kinds whose addition means data, an outside system or public traffic. */
const RISKY_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>([
  "database",
  "cache",
  "vectordb",
  "storage",
  "queue",
  "topic",
  "stream",
  "external",
  "gateway",
  "auth",
  "cdn",
  "cloud",
  "llm",
]);

export type DoorReason = { text: string; crossCutting: boolean };

export type DoorClassification = {
  oneWay: boolean;
  /** True when the decision record must carry `crossCutting`. */
  needsCrossCutting: boolean;
  reasons: DoorReason[];
};

const isPlanned = (n: Node): boolean => n.status === "proposed";

export function classifyChange(before: Document, after: Document): DoorClassification {
  const was = new Map(before.nodes.map((n) => [n.id, n]));
  const now = new Map(after.nodes.map((n) => [n.id, n]));
  const reasons: DoorReason[] = [];

  if (JSON.stringify(before.style ?? null) !== JSON.stringify(after.style ?? null)) {
    const from = before.style?.kind ?? "none";
    const to = after.style?.kind ?? "none";
    reasons.push({
      text: from === to ? `changes the ${to} style's layers or shared modules` : `changes the architecture style from ${from} to ${to}`,
      crossCutting: false,
    });
  }

  for (const n of after.nodes) {
    if (was.has(n.id)) continue;
    if (RISKY_KINDS.has(n.kind)) {
      reasons.push({ text: `adds ${n.kind} \`${n.id}\``, crossCutting: true });
    } else if (n.kind === "module" && n.parentId === undefined) {
      reasons.push({ text: `adds top-level module \`${n.id}\``, crossCutting: false });
    }
  }

  const edgeKeys = new Set(before.edges.map((e) => `${e.from}\n${e.to}`));
  const newExternal = new Set<string>();
  for (const e of after.edges) {
    if (edgeKeys.has(`${e.from}\n${e.to}`)) continue;
    const target = now.get(e.to);
    // A brand-new external node is already reported above.
    if (target?.kind === "external" && was.has(e.to)) newExternal.add(e.to);
  }
  for (const id of [...newExternal].sort()) {
    reasons.push({ text: `new dependency on external \`${id}\``, crossCutting: true });
  }

  for (const n of before.nodes) {
    const next = now.get(n.id);
    if (next === undefined) {
      if (!isPlanned(n)) reasons.push({ text: `removes \`${n.id}\``, crossCutting: false });
      continue;
    }
    if (next.layer !== n.layer && n.layer !== undefined && !isPlanned(n)) {
      reasons.push({
        text: `moves \`${n.id}\` from layer ${n.layer} to ${next.layer ?? "no layer"}`,
        crossCutting: false,
      });
    }
    if (next.parentId !== n.parentId && !isPlanned(n)) {
      const from = n.parentId === undefined ? "top level" : `\`${n.parentId}\``;
      const to = next.parentId === undefined ? "top level" : `\`${next.parentId}\``;
      reasons.push({ text: `moves \`${n.id}\` from ${from} to ${to}`, crossCutting: false });
    }
  }

  return {
    oneWay: reasons.length > 0,
    needsCrossCutting: reasons.some((r) => r.crossCutting),
    reasons,
  };
}

/** Node fields that change the structure, not just its labels. */
const STRUCTURAL_FIELDS = new Set(["parentId", "layer", "sourcePath", "kind", "status", "archikFile"]);

/**
 * True when a change alters the structure (nodes or edges added or
 * removed, a node moved, re-layered, re-kinded or re-pathed, the style
 * changed) — the kind of change that needs a decision record. Pure
 * wording edits (names, descriptions, notes) do not.
 */
export function isStructuralChange(before: Document, after: Document): boolean {
  if (JSON.stringify(before.style ?? null) !== JSON.stringify(after.style ?? null)) return true;
  const d = diffDocuments(before, after);
  if (d.nodes.added.length + d.nodes.removed.length + d.edges.added.length + d.edges.removed.length > 0) {
    return true;
  }
  if (d.nodes.changed.some((c) => c.changes.some((f) => STRUCTURAL_FIELDS.has(f.field)))) return true;
  return d.edges.changed.some((c) => c.changes.some((f) => f.field === "relationship" || f.field === "status"));
}
