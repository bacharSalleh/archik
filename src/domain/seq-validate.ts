import { SeqDocumentSchema } from "./seq-schema.ts";
import type { SeqDocument, SeqStep } from "./seq-schema.ts";
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
