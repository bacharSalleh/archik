/**
 * Governance constraint checker — architecture fitness rules, in the
 * model. Constraints are authored in the document YAML (usually the
 * root file) and enforced here against the MERGED diagram so a
 * cross-file edge can't dodge a rule by living in a sub-file.
 *
 * Two rule kinds (see schema.ts for the shapes):
 *   forbidEdge    — no edge may match relationship + from/to selectors
 *   requireOwner  — every matching node must declare `owner`
 *
 * Selectors AND their fields together; `parent` / `notParent` walk
 * the full parentId chain so "inside/outside the billing context"
 * works at any nesting depth. `except` ids are skipped — exceptions
 * live in the YAML where review can see them.
 *
 * Pure function over loaded docs, same contract as the other
 * validators: returns ValidationError[].
 */
import type { LoadedDoc } from "../io/discovery.ts";
import type { Constraint, Edge, Node, NodeSelector } from "./types.ts";
import type { ValidationError } from "./validate.ts";

function buildAncestry(nodes: Node[]): Map<string, Set<string>> {
  const parentOf = new Map<string, string | undefined>();
  for (const n of nodes) parentOf.set(n.id, n.parentId);
  const out = new Map<string, Set<string>>();
  for (const n of nodes) {
    const ancestors = new Set<string>();
    let cursor = n.parentId;
    let steps = 0;
    while (cursor !== undefined && steps <= nodes.length) {
      if (ancestors.has(cursor)) break; // cycle — schema rejects, stay safe
      ancestors.add(cursor);
      cursor = parentOf.get(cursor);
      steps++;
    }
    out.set(n.id, ancestors);
  }
  return out;
}

function matches(
  node: Node,
  sel: NodeSelector,
  ancestry: Map<string, Set<string>>,
): boolean {
  if (sel.id !== undefined && node.id !== sel.id) return false;
  if (sel.kind !== undefined && node.kind !== sel.kind) return false;
  if (sel.stereotype !== undefined && node.stereotype !== sel.stereotype) {
    return false;
  }
  const ancestors = ancestry.get(node.id) ?? new Set<string>();
  if (sel.parent !== undefined && !ancestors.has(sel.parent)) return false;
  if (sel.notParent !== undefined && ancestors.has(sel.notParent)) {
    return false;
  }
  return true;
}

/**
 * Constraint check for the WRITE paths (`suggest set`, canvas PUT):
 * evaluate the project's constraints as if `draft` had already
 * replaced the document at `draftAbs`. Catching a violation here —
 * before the sidecar is staged or the file hits disk — beats letting
 * CI reject it after the user already accepted the change.
 */
export function checkConstraintsWithDraft(
  docs: LoadedDoc[],
  draftAbs: string,
  draftRelPath: string,
  draftDoc: LoadedDoc["doc"],
): ValidationError[] {
  const substituted = docs.filter((d) => d.abs !== draftAbs);
  substituted.push({ abs: draftAbs, relPath: draftRelPath, doc: draftDoc });
  return checkConstraints(substituted);
}

export function checkConstraints(docs: LoadedDoc[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const nodes: Node[] = docs.flatMap((d) => d.doc.nodes);
  const edges: Array<{ edge: Edge; relPath: string }> = docs.flatMap((d) =>
    d.doc.edges.map((edge) => ({ edge, relPath: d.relPath })),
  );
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const ancestry = buildAncestry(nodes);

  const constraints: Array<{ constraint: Constraint; relPath: string }> = [];
  const seenIds = new Map<string, string>();
  for (const d of docs) {
    for (const c of d.doc.constraints ?? []) {
      const prior = seenIds.get(c.id);
      if (prior !== undefined) {
        errors.push({
          path: `constraints.${c.id}`,
          message: `duplicate constraint id "${c.id}" (already defined in ${prior})`,
        });
        continue;
      }
      seenIds.set(c.id, d.relPath);
      constraints.push({ constraint: c, relPath: d.relPath });
    }
  }

  for (const { constraint } of constraints) {
    const except = new Set(constraint.except ?? []);

    if (constraint.forbidEdge !== undefined) {
      const rule = constraint.forbidEdge;
      for (const { edge, relPath } of edges) {
        if (except.has(edge.id)) continue;
        if (
          rule.relationship !== undefined &&
          edge.relationship !== rule.relationship
        ) {
          continue;
        }
        // Cross-file endpoints aren't loaded as nodes here; an edge
        // whose endpoint can't be resolved can't be selector-matched,
        // so a selector on that side never fires for it.
        if (rule.from !== undefined) {
          const from = nodeById.get(edge.from);
          if (from === undefined || !matches(from, rule.from, ancestry)) {
            continue;
          }
        }
        if (rule.to !== undefined) {
          const to = nodeById.get(edge.to);
          if (to === undefined || !matches(to, rule.to, ancestry)) continue;
        }
        errors.push({
          path: `constraints.${constraint.id}`,
          message:
            `edge "${edge.id}" (${edge.from} → ${edge.to} via ${edge.relationship}, in ${relPath}) ` +
            `violates constraint "${constraint.id}": ${constraint.description} ` +
            `— fix the edge, or add "${edge.id}" to the constraint's \`except\` list with a reason in review.`,
        });
      }
    }

    if (constraint.requireOwner !== undefined) {
      const kinds = constraint.requireOwner.kinds;
      for (const node of nodes) {
        if (except.has(node.id)) continue;
        if (kinds !== undefined && !kinds.includes(node.kind)) continue;
        if (node.owner !== undefined) continue;
        errors.push({
          path: `constraints.${constraint.id}`,
          message:
            `node "${node.id}" (kind: ${node.kind}) violates constraint "${constraint.id}": ` +
            `${constraint.description} — add \`owner: <team>\` to the node, ` +
            `or add "${node.id}" to the constraint's \`except\` list.`,
        });
      }
    }
  }

  return errors;
}
