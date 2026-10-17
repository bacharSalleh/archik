/**
 * Affected-set analysis — the reverse lookup over the structure model.
 * Given a list of changed source files (usually from `git diff
 * --name-only <ref>`), walk the mappings the model declares and
 * answer "what does this change touch?":
 *
 *   changed file  ──▶ node.sourcePath ──▶ affected nodes
 *   affected node ◀── edges           ◀── dependents (nodes that
 *                                         depend on an affected node)
 *
 * Files that match nothing are reported as `unmapped` — the same
 * signal `archik drift` gives, but scoped to the current change set
 * instead of the whole tree. Archik model files themselves are
 * classified separately so a YAML edit doesn't read as "unmapped code".
 *
 * Pure function: takes already-loaded documents + the changed paths,
 * returns the report. The CLI wrapper handles git, filtering, and
 * formatting.
 */
import type { LoadedDoc } from "../io/discovery.ts";
import { isUnderPath } from "./validate.ts";
import type { Node } from "./types.ts";

export type AffectedNode = {
  id: string;
  kind: string;
  name: string;
  sourcePath: string;
  /** Which of the changed files landed inside this node's sourcePath. */
  files: string[];
};

export type Dependent = {
  id: string;
  kind: string;
  name: string;
  /** Affected node ids this node has an outgoing edge to. */
  dependsOn: string[];
};

export type AffectedReport = {
  nodes: AffectedNode[];
  /** Nodes outside the change set with an edge INTO an affected node —
   *  the code most likely to break. */
  dependents: Dependent[];
  /** Changed archik model files (any *.archik*.yaml). */
  modelFiles: string[];
  /** Changed files that matched no node sourcePath and aren't
   *  model files — the model has no opinion about them. */
  unmapped: string[];
  summary: {
    changedFiles: number;
    nodes: number;
    dependents: number;
    unmapped: number;
  };
};

function normalize(p: string): string {
  let out = p.split("\\").join("/");
  while (out.startsWith("./")) out = out.slice(2);
  return out.replace(/\/+$/, "");
}

function isModelFile(p: string): boolean {
  return /\.archik(\.\w+)*\.yaml$/.test(p) || p.startsWith(".archik/");
}

export function buildAffectedReport(
  changedFiles: string[],
  archDocs: LoadedDoc[],
): AffectedReport {
  const changed = [...new Set(changedFiles.map(normalize).filter((f) => f.length > 0))];

  // changed file → nodes via sourcePath containment (the same
  // segment-wise rule the validator uses). `claimedByNode` doubles as
  // the index for the unmapped classification below, so the node scan
  // happens exactly once.
  const allNodes: Node[] = archDocs.flatMap((d) => d.doc.nodes);
  const affectedNodes: AffectedNode[] = [];
  const affectedNodeIds = new Set<string>();
  const claimedByNode = new Set<string>();
  for (const node of allNodes) {
    if (node.sourcePath === undefined) continue;
    const files = changed.filter((f) => isUnderPath(f, node.sourcePath!));
    if (files.length === 0) continue;
    for (const f of files) claimedByNode.add(f);
    affectedNodes.push({
      id: node.id,
      kind: node.kind,
      name: node.name,
      sourcePath: node.sourcePath,
      files,
    });
    affectedNodeIds.add(node.id);
  }

  // Upstream dependents: any edge whose target is an affected node.
  const byId = new Map(allNodes.map((n) => [n.id, n]));
  const dependsOn = new Map<string, Set<string>>();
  for (const edge of archDocs.flatMap((d) => d.doc.edges)) {
    if (!affectedNodeIds.has(edge.to) || affectedNodeIds.has(edge.from)) continue;
    if (!byId.has(edge.from)) continue;
    const set = dependsOn.get(edge.from) ?? new Set<string>();
    set.add(edge.to);
    dependsOn.set(edge.from, set);
  }
  const dependents: Dependent[] = [...dependsOn].map(([id, targets]) => {
    const n = byId.get(id)!;
    return { id, kind: n.kind, name: n.name, dependsOn: [...targets].sort() };
  });

  const modelFiles = changed.filter(isModelFile);
  const unmapped = changed.filter(
    (f) => !isModelFile(f) && !claimedByNode.has(f),
  );

  return {
    nodes: affectedNodes,
    dependents,
    modelFiles,
    unmapped,
    summary: {
      changedFiles: changed.length,
      nodes: affectedNodes.length,
      dependents: dependents.length,
      unmapped: unmapped.length,
    },
  };
}
