import { SeqDocumentSchema } from "./seq-schema.ts";
import type { SeqDocument, SeqStep } from "./seq-schema.ts";
import type { LoadedDoc } from "../io/discovery.ts";
import type { LoadedSeqDoc } from "../io/seq-discovery.ts";
import type { LoadedUseCaseDoc } from "../io/usecase-discovery.ts";
import type { ValidateResult, ValidationError } from "./validate.ts";

export function validateSeqDocument(input: unknown): ValidateResult<SeqDocument> {
  const result = SeqDocumentSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    errors: result.error.issues.flatMap((issue) => {
      if (issue.code === "unrecognized_keys") {
        return (issue as unknown as { keys: string[] }).keys.map((key) => ({
          path: [...issue.path, key].map(String).join(".") || "<root>",
          message: "unrecognized key",
        }));
      }
      return [{
        path: issue.path.length === 0 ? "<root>" : issue.path.map(String).join("."),
        message: issue.message,
      }];
    }),
  };
}

function collectStepParticipantRefs(
  steps: SeqStep[],
  participantIds: Set<string>,
  errors: ValidationError[],
  pathPrefix: string,
): void {
  steps.forEach((step, i) => {
    const p = `${pathPrefix}.${i}`;
    if (step.type === "message") {
      if (!participantIds.has(step.from)) {
        errors.push({ path: `${p}.from`, message: `participant "${step.from}" is not declared in participants` });
      }
      if (!participantIds.has(step.to)) {
        errors.push({ path: `${p}.to`, message: `participant "${step.to}" is not declared in participants` });
      }
    } else if (step.type === "note") {
      step.participants.forEach((pid, j) => {
        if (!participantIds.has(pid)) {
          errors.push({ path: `${p}.participants.${j}`, message: `participant "${pid}" is not declared in participants` });
        }
      });
    } else if (step.type === "group" && step.branches) {
      step.branches.forEach((branch, bi) => {
        collectStepParticipantRefs(branch.steps, participantIds, errors, `${p}.branches.${bi}.steps`);
      });
    }
  });
}

export function checkSeqNodeRefs(
  doc: SeqDocument,
  knownNodeIds: Set<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const participantIds = new Set<string>();

  doc.participants.forEach((p, i) => {
    participantIds.add(p.id);
    if (!knownNodeIds.has(p.nodeId)) {
      errors.push({
        path: `participants.${i}.nodeId`,
        message: `nodeId "${p.nodeId}" does not match any architecture node. Run \`npx archik q list\` to see available node ids.`,
      });
    }
  });

  collectStepParticipantRefs(doc.steps, participantIds, errors, "steps");
  return errors;
}

export function checkSeqFilePaths(
  seqFilePaths: string[],
  exists: (relPath: string) => boolean,
): ValidationError[] {
  return seqFilePaths
    .filter((p) => !exists(p))
    .map((p) => ({
      path: "seqFiles",
      message: `seqFile "${p}" does not exist on disk (resolved relative to the project root)`,
    }));
}

/**
 * ECB (Entity / Control / Boundary) transition rules — Jacobson's
 * robustness analysis carried into the runtime view. Applies ONLY
 * inside seq diagrams that carry a `realizes` block (robustness is
 * per-use-case; un-realized seqs are exempt). For each message in
 * such a seq:
 *
 *   1. Resolve the `from` / `to` participant ids → participant.nodeId
 *      → architecture node → optional `stereotype`.
 *   2. If EITHER endpoint lacks a stereotype, skip silently — gradual
 *      adoption: tag obvious nodes first.
 *   3. If both endpoints have stereotypes, the (from, to) pair must
 *      be in the allowed transition table; otherwise emit an error.
 *
 * The rules:
 *   boundary → control                      ✓
 *   control  → boundary | control | entity  ✓
 *   entity   → control | entity             ✓
 *   boundary → boundary                     ✗
 *   boundary → entity                       ✗
 *   entity   → boundary                     ✗
 *
 * Recurses into group branches (alt / opt / loop / par / break) so
 * every nested message is checked. `ref` groups have no direct
 * messages and are skipped. Notes have no from/to and are skipped.
 *
 * Self-calls (from === to) are checked too — a boundary self-call is
 * fine (boundary → boundary forbidden by the table, but a participant
 * messaging itself is unusual and the table already says no, so we
 * leave that as-is).
 */
const ECB_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  boundary: new Set(["control"]),
  control: new Set(["boundary", "control", "entity"]),
  entity: new Set(["control", "entity"]),
};

function walkEcbSteps(
  steps: SeqStep[],
  participantStereotype: Map<string, string>,
  seqRelPath: string,
  seqName: string,
  pathPrefix: string,
  errors: ValidationError[],
): void {
  steps.forEach((step, i) => {
    const p = `${pathPrefix}.${i}`;
    if (step.type === "message") {
      const fromS = participantStereotype.get(step.from);
      const toS = participantStereotype.get(step.to);
      if (fromS === undefined || toS === undefined) return;
      const allowed = ECB_TRANSITIONS[fromS];
      if (allowed && !allowed.has(toS)) {
        errors.push({
          path: `${seqRelPath}:${p}`,
          message:
            `ECB violation in seq "${seqName}" message "${step.id}": ` +
            `${fromS} → ${toS} is forbidden by the robustness rules ` +
            `(boundaries don't talk to boundaries or entities; entities don't ` +
            `talk to boundaries). Insert a control between them, or revisit ` +
            `the stereotype assignment.`,
        });
      }
    } else if (step.type === "group" && step.branches) {
      step.branches.forEach((branch, bi) => {
        walkEcbSteps(
          branch.steps,
          participantStereotype,
          seqRelPath,
          seqName,
          `${p}.branches.${bi}.steps`,
          errors,
        );
      });
    }
  });
}

export function checkSeqEcbRules(
  seqDocs: LoadedSeqDoc[],
  archDocs: LoadedDoc[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  // Build the architecture-wide node id → stereotype map. Nodes
  // without a stereotype simply don't appear, which makes the
  // "skip when undefined" check a single Map.get().
  const stereotypeOf = new Map<string, string>();
  for (const { doc } of archDocs) {
    for (const node of doc.nodes) {
      if (node.stereotype !== undefined) {
        stereotypeOf.set(node.id, node.stereotype);
      }
    }
  }

  for (const seq of seqDocs) {
    if (seq.doc.realizes === undefined) continue;
    const participantStereotype = new Map<string, string>();
    for (const p of seq.doc.participants) {
      const s = stereotypeOf.get(p.nodeId);
      if (s !== undefined) participantStereotype.set(p.id, s);
    }
    walkEcbSteps(
      seq.doc.steps,
      participantStereotype,
      seq.relPath,
      seq.doc.name,
      "steps",
      errors,
    );
  }

  return errors;
}

/**
 * Backref integrity: every architecture node listed as a participant
 * in a `realizes`-bound seq diagram must declare that seq file in its
 * own `seqFiles` array. Without this check, Claude (or any author)
 * can write a perfectly valid seq + use case + realizes block, but
 * the canvas has no way to surface the diagram on the participating
 * nodes — it's "linked from the requirements side, orphaned from the
 * structural side."
 *
 * Only realised seqs are checked (matches the ECB rule pattern). An
 * ad-hoc seq without `realizes` is treated as a scratch / proposal
 * doc and isn't required to be backreffed by every participant.
 *
 * Unknown nodeIds are reported by `checkSeqNodeRefs` already; this
 * check skips them to avoid double-reporting the same problem.
 */
export function checkSeqNodeBackrefs(
  seqDocs: LoadedSeqDoc[],
  archDocs: LoadedDoc[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  // node.id → set of seqFile paths the node already references.
  // Built once across all architecture docs so cross-file diagrams
  // (a sub-arch node referencing a seq from elsewhere) are honoured.
  const seqFilesOf = new Map<string, Set<string>>();
  for (const { doc } of archDocs) {
    for (const node of doc.nodes) {
      const set = seqFilesOf.get(node.id) ?? new Set<string>();
      for (const p of node.seqFiles ?? []) set.add(p);
      seqFilesOf.set(node.id, set);
    }
  }

  for (const seq of seqDocs) {
    if (seq.doc.realizes === undefined) continue;

    // One node may appear multiple times in `participants` (e.g. an
    // alias per role) — only report the missing backref once per
    // (seq, node) pair so the error list stays scannable.
    const reported = new Set<string>();
    for (const p of seq.doc.participants) {
      if (reported.has(p.nodeId)) continue;
      const declared = seqFilesOf.get(p.nodeId);
      if (declared === undefined) continue; // unknown nodeId — handled elsewhere
      if (declared.has(seq.relPath)) continue; // backref present, all good
      reported.add(p.nodeId);
      errors.push({
        path: `${seq.relPath}:participants.${p.id}`,
        message:
          `seq "${seq.doc.name}" lists node "${p.nodeId}" as a ` +
          `participant, but that node's \`seqFiles\` array does not ` +
          `reference this diagram. Add ` +
          `"${seq.relPath}" to node "${p.nodeId}"'s \`seqFiles\` ` +
          `array via \`npx archik suggest set\` so the canvas can ` +
          `surface the flow on that node.`,
      });
    }
  }

  return errors;
}

/**
 * Bidirectional `realizes` integrity. Two checks per seq file with a
 * `realizes` block:
 *
 *   1. The referenced use case + slice must exist in the use case
 *      index. Otherwise the realization claim is dangling.
 *
 *   2. The named slice's `realization.seqFile` (if any) must point
 *      back at THIS seq file. Otherwise the seq is claiming to
 *      realize a slice the slice doesn't claim back — silent drift,
 *      exactly the failure mode the Jacobson traceability rule is
 *      meant to prevent.
 *
 * Both directions of the check matter: a seq saying "I realize X"
 * with no use case to back it is a dangling reference; a seq saying
 * "I realize X" while X claims a different seq realizes it is the
 * more confusing failure (the diagram looks correct on each side but
 * the link between them is wrong).
 */
export function checkSeqRealizesIntegrity(
  seqDocs: LoadedSeqDoc[],
  ucDocs: LoadedUseCaseDoc[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const ucIndex = new Map(ucDocs.map((d) => [d.doc.id, d]));

  for (const seq of seqDocs) {
    if (seq.doc.realizes === undefined) continue;
    const { useCase: ucId, slice: sliceId } = seq.doc.realizes;
    const uc = ucIndex.get(ucId);
    if (uc === undefined) {
      errors.push({
        path: `${seq.relPath}:realizes.useCase`,
        message:
          `seq diagram "${seq.doc.name}" claims to realize use case ` +
          `"${ucId}" but no such use case file was found.`,
      });
      continue;
    }
    const slice = uc.doc.slices.find((s) => s.id === sliceId);
    if (slice === undefined) {
      errors.push({
        path: `${seq.relPath}:realizes.slice`,
        message:
          `seq diagram "${seq.doc.name}" claims to realize slice ` +
          `"${sliceId}" of use case "${ucId}", but that use case has ` +
          `no slice with that id. Available slices: ${uc.doc.slices
            .map((s) => s.id)
            .join(", ")}.`,
      });
      continue;
    }
    // The slice exists. Now: does it point back?
    if (slice.realization === undefined) {
      errors.push({
        path: `${seq.relPath}:realizes.slice`,
        message:
          `seq diagram "${seq.doc.name}" realizes slice "${sliceId}" of ` +
          `"${ucId}", but the slice does not declare ` +
          `\`realization.seqFile\`. Add ` +
          `\`realization: { seqFile: "${seq.relPath}" }\` to slice ` +
          `"${sliceId}" in ${uc.relPath}.`,
      });
      continue;
    }
    if (slice.realization.seqFile !== seq.relPath) {
      errors.push({
        path: `${seq.relPath}:realizes.slice`,
        message:
          `seq diagram "${seq.doc.name}" realizes slice "${sliceId}" of ` +
          `"${ucId}", but that slice's realization.seqFile points at ` +
          `"${slice.realization.seqFile}", not at this file ("${seq.relPath}"). ` +
          `Pick one canonical seq file and update both sides.`,
      });
    }
  }

  return errors;
}
