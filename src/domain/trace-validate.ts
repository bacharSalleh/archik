import type { LoadedTraceDoc } from "../io/trace-discovery.ts";
import type { LoadedUseCaseDoc } from "../io/usecase-discovery.ts";
import type { LoadedSeqDoc } from "../io/seq-discovery.ts";
import type { ValidationError } from "./validate.ts";

export type TraceCheckResult = { errors: ValidationError[]; info: string[] };

/** Collect every `message` step id from a seq doc, walking into groups. */
function seqMessageIds(steps: unknown[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: unknown[]): void => {
    for (const s of list) {
      const step = s as { type?: string; id?: string; branches?: Array<{ steps: unknown[] }> };
      if (step.type === "message" && step.id) ids.add(step.id);
      if (step.branches) for (const b of step.branches) walk(b.steps);
    }
  };
  walk(steps);
  return ids;
}

export function checkTraces(
  traces: LoadedTraceDoc[],
  ucDocs: LoadedUseCaseDoc[],
  seqDocs: LoadedSeqDoc[],
): TraceCheckResult {
  const errors: ValidationError[] = [];
  const info: string[] = [];

  const sliceKey = new Set<string>();
  for (const { doc } of ucDocs) {
    for (const slice of doc.slices) sliceKey.add(`${doc.id}/${slice.id}`);
  }

  for (const { relPath, doc } of traces) {
    // 1. slice resolves
    if (!sliceKey.has(`${doc.useCase}/${doc.slice}`)) {
      errors.push({ path: relPath, message: `trace targets unknown use case / slice "${doc.useCase}/${doc.slice}"` });
      continue;
    }
    if (doc.seqFile === undefined) continue;

    // 2. bound: the seq file must be discovered
    const seq = seqDocs.find((s) => s.relPath === doc.seqFile || s.abs.endsWith("/" + doc.seqFile!));
    if (seq === undefined) {
      errors.push({ path: relPath, message: `trace seqFile "${doc.seqFile}" is not a discovered sequence diagram` });
      continue;
    }
    const msgIds = seqMessageIds((seq.doc as { steps: unknown[] }).steps);
    const participantIds = new Set(
      (seq.doc as { participants: Array<{ id: string }> }).participants.map((p) => p.id),
    );

    // 3. every bound step id exists; from/to resolve to participants
    const hit = new Set<string>();
    for (const step of doc.steps) {
      if (step.id !== undefined) {
        if (!msgIds.has(step.id)) {
          errors.push({ path: relPath, message: `trace step id "${step.id}" is not a message id in ${doc.seqFile}` });
        } else {
          hit.add(step.id);
        }
      }
      for (const end of [step.from, step.to]) {
        if (!participantIds.has(end)) {
          errors.push({ path: relPath, message: `trace step references "${end}", not a participant in ${doc.seqFile}` });
        }
      }
    }

    // 4. seq messages the run never exercised → informational
    for (const id of msgIds) {
      if (!hit.has(id)) info.push(`${relPath}: seq step "${id}" was not exercised by this run`);
    }
  }

  return { errors, info };
}
