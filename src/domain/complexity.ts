/**
 * Pure complexity heuristics over the loaded archik documents. No I/O,
 * no formatting — feed in `LoadedDoc[]`, get back `Finding[]`. The CLI
 * (`archik complexity`) and the `validate` advisory line shape these.
 *
 * Findings are advisory: they suggest decomposition, they never fail a
 * build on their own. Counts are per-file on purpose — splitting a model
 * into `archikFile` sub-files is exactly the fix, and a split model
 * should score well.
 */
import type { LoadedDoc } from "../io/discovery.ts";

export type ComplexityLimits = {
  maxNodes: number; // per file
  maxEdges: number; // per file
  maxChildren: number; // per container (parentId)
  maxDegree: number; // per node, in + out
  maxDepth: number; // parentId chain length (ancestors)
};

export const DEFAULT_LIMITS: ComplexityLimits = {
  maxNodes: 15,
  maxEdges: 20,
  maxChildren: 6,
  maxDegree: 6,
  maxDepth: 3,
};

export type FindingKind =
  | "file-nodes"
  | "file-edges"
  | "container-children"
  | "node-degree"
  | "nesting-depth";

export type Finding = {
  kind: FindingKind;
  subject: string; // file relPath or node id
  value: number; // measured
  limit: number; // threshold exceeded
  suggestion: string; // one-sentence concrete fix
};

/** Number of ancestors of `id` via parentId (root nodes => 0). */
function ancestorDepth(id: string, parentOf: Map<string, string | undefined>): number {
  let depth = 0;
  let cursor = parentOf.get(id);
  // bound the walk so a malformed cycle can't loop forever
  while (cursor !== undefined && depth <= parentOf.size) {
    depth++;
    cursor = parentOf.get(cursor);
  }
  return depth;
}

export function analyzeComplexity(
  docs: LoadedDoc[],
  limits: ComplexityLimits,
): Finding[] {
  const findings: Finding[] = [];

  // Per-file counts.
  for (const { doc, relPath } of docs) {
    if (doc.nodes.length > limits.maxNodes) {
      findings.push({
        kind: "file-nodes",
        subject: relPath,
        value: doc.nodes.length,
        limit: limits.maxNodes,
        suggestion: `split ${relPath} into sub-files via archikFile (${doc.nodes.length} nodes; limit ${limits.maxNodes})`,
      });
    }
    if (doc.edges.length > limits.maxEdges) {
      findings.push({
        kind: "file-edges",
        subject: relPath,
        value: doc.edges.length,
        limit: limits.maxEdges,
        suggestion: `split ${relPath} into sub-files via archikFile (${doc.edges.length} edges; limit ${limits.maxEdges})`,
      });
    }

    // Container child counts + nesting depth (parentId is within-file).
    const childCount = new Map<string, number>();
    const parentOf = new Map<string, string | undefined>();
    for (const n of doc.nodes) parentOf.set(n.id, n.parentId);
    for (const n of doc.nodes) {
      if (n.parentId !== undefined) {
        childCount.set(n.parentId, (childCount.get(n.parentId) ?? 0) + 1);
      }
    }
    for (const [container, count] of childCount) {
      if (count > limits.maxChildren) {
        findings.push({
          kind: "container-children",
          subject: container,
          value: count,
          limit: limits.maxChildren,
          suggestion: `give container '${container}' its own archikFile — ${count} children, limit ${limits.maxChildren}`,
        });
      }
    }
    for (const n of doc.nodes) {
      const depth = ancestorDepth(n.id, parentOf);
      if (depth > limits.maxDepth) {
        findings.push({
          kind: "nesting-depth",
          subject: n.id,
          value: depth,
          limit: limits.maxDepth,
          suggestion: `flatten or split — '${n.id}' is ${depth} levels deep, limit ${limits.maxDepth}`,
        });
      }
    }
  }

  // Node degree across the whole merged model (in + out).
  const degree = new Map<string, number>();
  for (const { doc } of docs) {
    for (const e of doc.edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
  }
  for (const [id, deg] of degree) {
    if (deg > limits.maxDegree) {
      findings.push({
        kind: "node-degree",
        subject: id,
        value: deg,
        limit: limits.maxDegree,
        suggestion: `'${id}' has ${deg} connections — name a bounded context or add a port/gateway (limit ${limits.maxDegree})`,
      });
    }
  }

  // Worst overflow first.
  findings.sort((a, b) => b.value - b.limit - (a.value - a.limit));
  return findings;
}
