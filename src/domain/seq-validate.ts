import { SeqDocumentSchema } from "./seq-schema.ts";
import type { SeqDocument, SeqStep } from "./seq-schema.ts";
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
