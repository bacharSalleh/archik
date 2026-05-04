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
 */
export function checkUseCaseTestPaths(
  ucDocs: LoadedUseCaseDoc[],
  exists: (relPath: string) => boolean,
): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const { relPath, doc } of ucDocs) {
    doc.slices.forEach((slice, i) => {
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
 * seq file. The bidirectional `realizes` integrity check (does the
 * seq file's `realizes` block point back?) lives in seq-validate to
 * keep the seq-side check next to the seq schema.
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
      if (!seqByRel.has(slice.realization.seqFile)) {
        errors.push({
          path: `${relPath}:slices.${i}.realization.seqFile`,
          message:
            `slice "${slice.id}" realization seqFile ` +
            `"${slice.realization.seqFile}" does not exist or did not parse. ` +
            `Run \`npx archik q sequences\` to see available seq files.`,
        });
      }
    });
  }
  return errors;
}
