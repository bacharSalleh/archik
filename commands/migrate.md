---
description: Finish a migration — back-fill the artifacts the migrator flagged
---

# /archik:migrate — back-fill what the deterministic migration couldn't

`archik upgrade --migrate` already ran the **deterministic** migration:
it archived the old project, moved files into the current layout,
validated, and advanced `.archik/.version`. It then flagged the parts
that need **judgment** — usually: *the project has an architecture but no
use cases / sequence diagrams.* Your job is to back-fill those, grounded
in **both** the current model and the **archived original**.

The deterministic steps are done. Do NOT redo them. You author the
missing artifacts; `archik validate` is your gate.

## CLI-only for architecture; direct-write for the Jacobson files

Interact with the architecture diagram only through `npx archik`. Actors,
use cases, and sequence diagrams are **direct-write** files (no sidecar) —
author them with `Write`, then `npx archik validate`. Never edit
`.archik/main.archik.yaml` by hand. **Never delete `.archik.archive/`** —
it is the developer's only copy of the pre-migration project.

## Steps

1. **See exactly what's missing.** The migrator's `needsJudgment` hint is
   printed once and not re-derivable, so check the project directly:
   ```bash
   npx archik q usecases     # empty → use cases need back-filling
   npx archik q actors       # empty → actors needed first (use cases reference them)
   npx archik q sequences    # which flows already have a seq diagram
   ```

2. **Read the archived original — this is the migration's whole point.**
   Find the newest archive and read the old project's intent (descriptions,
   any notes, the old structure) so the back-fill reflects what the
   developer actually built, not a generic guess:
   ```bash
   ls -t .archik.archive/        # newest timestamp dir is the pre-migration copy
   ```
   Read the files under that dir with the `Read` tool (the archive is a
   plain backup, not a live archik doc — reading it directly is correct).

3. **Ground the use cases in the current model.** Combine the archive's
   intent with the live structure:
   ```bash
   npx archik q stats
   npx archik q list
   npx archik q edges
   ```

4. **Author actors first** (if `q actors` was empty). Use cases reference
   actors by id, and validate rejects a use case whose `primaryActor`
   isn't in the actor index. Direct-write `.archik/actors.archik.actors.yaml`
   (schema: `npx archik schema actors`), then `npx archik validate`.

5. **Author one use case per real flow.** Direct-write
   `.archik/usecases/<id>.archik.uc.yaml` (schema: `npx archik schema uc`).
   Mark each slice `status: proposed` and give it `tests:` paths only if
   those files exist on disk — otherwise omit `tests` (active slices
   require on-disk tests). Validate after each:
   `npx archik validate .archik/main.archik.yaml`.

6. **Author a sequence diagram per primary slice.** Direct-write
   `.archik/<usecase>.<slice>.archik.seq.yaml` (schema: `npx archik schema seq`).
   Every participant `nodeId` must be a real node; add a `realizes` block
   AND point the slice's `realization.seqFile` back at the file
   (bidirectional). Add the seq to each participating node's `seqFiles`
   via the normal `suggest set` → `accept` workflow.

7. **Verify and report.** Then propose the natural next step (write the
   tests the slices name, flip them to `active`), don't end on "done":
   ```bash
   npx archik validate .archik/main.archik.yaml
   npx archik trace
   npx archik drift
   ```

## Done when

`archik validate` is clean and `archik q usecases` lists the back-filled
use cases, each primary slice realising a sequence diagram. The archive
stays untouched as the developer's rollback.
