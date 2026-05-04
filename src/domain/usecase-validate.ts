/**
 * Cross-file validation for use cases and actors. The pure schema in
 * `usecase-schema.ts` checks one document at a time; this module
 * stitches multiple use case files, the actor index, and the seq
 * file index together — same separation of concerns as
 * `validate.ts` ↔ `schema.ts`.
 *
 * Checks layered here (in order):
 *   1. Use case ids unique across all `*.archik.uc.yaml`.
 *   2. Actor ids unique across all `*.archik.actors.yaml`.
 *   3. Every use case `primaryActor` and `secondaryActors[]` resolves
 *      against the actor index.
 *   4. Every active slice has tests; every test path exists on disk.
 *   5. Every `slice.realization.seqFile`, when present, exists on disk
 *      AND is one of the discovered seq files (the seq schema check
 *      itself is in seq-validate; the bidirectional `realizes` check
 *      lives there too).
 */
import type { LoadedUseCaseDoc } from "../io/usecase-discovery.ts";
import type { LoadedActorDoc } from "../io/actor-discovery.ts";
import type { LoadedSeqDoc } from "../io/seq-discovery.ts";
import type { ValidationError } from "./validate.ts";

export type ActorIndex = Map<string, { relPath: string }>;
export type UseCaseIndex = Map<string, { relPath: string }>;

export function buildActorIndex(
  docs: LoadedActorDoc[],
): { index: ActorIndex; errors: ValidationError[] } {
  const index: ActorIndex = new Map();
  const errors: ValidationError[] = [];
  for (const { relPath, doc } of docs) {
    for (const actor of doc.actors) {
      const prior = index.get(actor.id);
      if (prior !== undefined) {
        errors.push({
          path: relPath,
          message:
            `actor id "${actor.id}" is duplicated across actor files ` +
            `(also defined in ${prior.relPath})`,
        });
        continue;
      }
      index.set(actor.id, { relPath });
    }
  }
  return { index, errors };
}

export function buildUseCaseIndex(
  docs: LoadedUseCaseDoc[],
): { index: UseCaseIndex; errors: ValidationError[] } {
  const index: UseCaseIndex = new Map();
  const errors: ValidationError[] = [];
  for (const { relPath, doc } of docs) {
    const prior = index.get(doc.id);
    if (prior !== undefined) {
      errors.push({
        path: relPath,
        message:
          `use case id "${doc.id}" is duplicated across files ` +
          `(also defined in ${prior.relPath})`,
      });
      continue;
    }
    index.set(doc.id, { relPath });
  }
  return { index, errors };
}

export function checkUseCaseActorRefs(
  ucDocs: LoadedUseCaseDoc[],
  actorIndex: ActorIndex,
): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const { relPath, doc } of ucDocs) {
    if (!actorIndex.has(doc.primaryActor)) {
      errors.push({
        path: `${relPath}:primaryActor`,
        message:
          `use case "${doc.id}" references unknown primaryActor ` +
          `"${doc.primaryActor}". Define it in a *.archik.actors.yaml file.`,
      });
    }
    if (doc.secondaryActors) {
      doc.secondaryActors.forEach((actorId, i) => {
        if (!actorIndex.has(actorId)) {
          errors.push({
            path: `${relPath}:secondaryActors.${i}`,
            message:
              `use case "${doc.id}" references unknown secondary actor ` +
              `"${actorId}". Define it in a *.archik.actors.yaml file.`,
          });
        }
      });
    }
  }
  return errors;
}

/**
 * Active slices must have ≥ 1 test path and every test path must
 * exist on disk. The schema's superRefine already rejects active
 * slices without tests; this layer checks on-disk existence.
 *
 * Proposed and deprecated slices are exempt — `proposed` explicitly
 * means "the test may not exist yet" (mirroring the sourcePath rule
 * in `checkSourcePaths`), and `deprecated` means the test may have
 * already been removed. Without this exemption a user couldn't
 * sketch a future slice in the use case file.
 */
export function checkUseCaseTestPaths(
  ucDocs: LoadedUseCaseDoc[],
  exists: (relPath: string) => boolean,
): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const { relPath, doc } of ucDocs) {
    doc.slices.forEach((slice, i) => {
      const isPlanned =
        slice.status === "proposed" || slice.status === "deprecated";
      if (isPlanned) return;
      if (slice.tests === undefined) return;
      slice.tests.forEach((testPath, j) => {
        if (!exists(testPath)) {
          errors.push({
            path: `${relPath}:slices.${i}.tests.${j}`,
            message:
              `slice "${slice.id}" test "${testPath}" does not exist on disk ` +
              `(resolved relative to project root). Either fix the path or ` +
              `mark the slice \`status: proposed\`.`,
          });
        }
      });
    });
  }
  return errors;
}

/**
 * Every `slice.realization.seqFile` must point at a real, discovered
 * seq file AND that seq file's `realizes` block must point back at
 * this slice. The seq-side bidirectional check in `seq-validate.ts`
 * only catches cases where the seq HAS a `realizes` block; this UC-side
 * pass closes the loop for the case where a slice claims a seq with
 * NO `realizes` block at all (silent traceability drift).
 */
export function checkUseCaseRealizationPaths(
  ucDocs: LoadedUseCaseDoc[],
  seqDocs: LoadedSeqDoc[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const seqByRel = new Map(seqDocs.map((d) => [d.relPath, d]));
  for (const { relPath, doc } of ucDocs) {
    doc.slices.forEach((slice, i) => {
      if (slice.realization === undefined) return;
      const seq = seqByRel.get(slice.realization.seqFile);
      if (seq === undefined) {
        errors.push({
          path: `${relPath}:slices.${i}.realization.seqFile`,
          message:
            `slice "${slice.id}" realization seqFile ` +
            `"${slice.realization.seqFile}" does not exist or did not parse. ` +
            `Run \`npx archik q sequences\` to see available seq files.`,
        });
        return;
      }
      // Bidirectional integrity: does the seq point back?
      if (seq.doc.realizes === undefined) {
        errors.push({
          path: `${relPath}:slices.${i}.realization.seqFile`,
          message:
            `slice "${slice.id}" claims realization "${slice.realization.seqFile}", ` +
            `but that seq diagram has no \`realizes\` block. Add ` +
            `\`realizes: { useCase: "${doc.id}", slice: "${slice.id}" }\` ` +
            `to ${seq.relPath}, or remove the realization claim.`,
        });
        return;
      }
      if (
        seq.doc.realizes.useCase !== doc.id ||
        seq.doc.realizes.slice !== slice.id
      ) {
        errors.push({
          path: `${relPath}:slices.${i}.realization.seqFile`,
          message:
            `slice "${slice.id}" claims realization "${slice.realization.seqFile}", ` +
            `but that seq diagram's \`realizes\` points at ` +
            `"${seq.doc.realizes.useCase}/${seq.doc.realizes.slice}", ` +
            `not at "${doc.id}/${slice.id}". Pick one canonical link.`,
        });
      }
    });
  }
  return errors;
}
