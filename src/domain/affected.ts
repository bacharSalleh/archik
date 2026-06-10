/**
 * Affected-set analysis — the reverse lookup over the Jacobson chain.
 * Given a list of changed source files (usually from `git diff
 * --name-only <ref>`), walk every mapping the model already declares
 * and answer "what does this change touch?":
 *
 *   changed file ──▶ node.sourcePath   ──▶ affected nodes
 *   changed file ──▶ slice.tests[]     ──▶ affected slices (direct)
 *   affected node ─▶ seq participants  ──▶ affected slices (via realization)
 *   affected node ─▶ seq participants  ──▶ stale seq diagrams
 *   affected slices ▶ slice.tests[]    ──▶ tests to run
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
import type { LoadedSeqDoc } from "../io/seq-discovery.ts";
import type { LoadedUseCaseDoc } from "../io/usecase-discovery.ts";
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

export type AffectedSlice = {
  useCase: string;
  useCaseName: string;
  slice: string;
  /** How the slice got pulled in:
   *    test  — a changed file IS one of the slice's test paths
   *    node  — a changed file touched a node participating in the
   *            slice's realization seq
   *    seq   — the slice's realization seq file itself changed */
  via: Array<"test" | "node" | "seq">;
  tests: string[];
};

export type StaleSeq = {
  seqFile: string;
  seqName: string;
  /** Affected node ids that participate in this seq. */
  nodes: string[];
};

export type AffectedReport = {
  nodes: AffectedNode[];
  slices: AffectedSlice[];
  staleSeqs: StaleSeq[];
  /** Union of test paths across affected slices — "what should I run?". */
  testsToRun: string[];
  /** Changed archik model files (any *.archik*.yaml). */
  modelFiles: string[];
  /** Changed files that matched no node sourcePath, no slice test,
   *  and aren't model files — the model has no opinion about them. */
  unmapped: string[];
  summary: {
    changedFiles: number;
    nodes: number;
    useCases: number;
    slices: number;
    staleSeqs: number;
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
  ucDocs: LoadedUseCaseDoc[],
  seqDocs: LoadedSeqDoc[],
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

  // Seq diagrams whose participants include an affected node — the
  // documented flow may no longer match the code that just changed.
  // Keyed by NORMALISED path so lookups via slice.realization.seqFile
  // (user-authored, may carry a ./ prefix) still hit.
  const staleSeqs: StaleSeq[] = [];
  const staleByRel = new Map<string, StaleSeq>();
  for (const { relPath, doc } of seqDocs) {
    const nodes = [
      ...new Set(
        doc.participants
          .map((p) => p.nodeId)
          .filter((id) => affectedNodeIds.has(id)),
      ),
    ];
    if (nodes.length === 0) continue;
    const entry: StaleSeq = { seqFile: relPath, seqName: doc.name, nodes };
    staleSeqs.push(entry);
    staleByRel.set(normalize(relPath), entry);
  }

  // Slices: pulled in by a changed test file, a changed realization
  // seq file, or an affected participant node.
  const changedSet = new Set(changed);
  const slices: AffectedSlice[] = [];
  for (const { doc } of ucDocs) {
    for (const slice of doc.slices) {
      if ((slice.status ?? "active") === "deprecated") continue;
      const via: AffectedSlice["via"] = [];
      const tests = slice.tests ?? [];
      if (tests.some((t) => changedSet.has(normalize(t)))) via.push("test");
      if (slice.realization !== undefined) {
        const seqRel = normalize(slice.realization.seqFile);
        if (changedSet.has(seqRel)) via.push("seq");
        if (staleByRel.has(seqRel)) via.push("node");
      }
      if (via.length === 0) continue;
      slices.push({
        useCase: doc.id,
        useCaseName: doc.name,
        slice: slice.id,
        via,
        tests,
      });
    }
  }

  const testsToRun = [...new Set(slices.flatMap((s) => s.tests))];

  // Classify leftovers. A changed file counts as "covered" when any
  // node or any slice test claimed it.
  const coveredByTests = new Set(
    ucDocs.flatMap((u) =>
      u.doc.slices.flatMap((s) => (s.tests ?? []).map(normalize)),
    ),
  );
  const modelFiles = changed.filter(isModelFile);
  const unmapped = changed.filter(
    (f) => !isModelFile(f) && !claimedByNode.has(f) && !coveredByTests.has(f),
  );

  return {
    nodes: affectedNodes,
    slices,
    staleSeqs,
    testsToRun,
    modelFiles,
    unmapped,
    summary: {
      changedFiles: changed.length,
      nodes: affectedNodes.length,
      useCases: new Set(slices.map((s) => s.useCase)).size,
      slices: slices.length,
      staleSeqs: staleSeqs.length,
      unmapped: unmapped.length,
    },
  };
}
