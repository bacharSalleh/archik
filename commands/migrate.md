---
description: Finish a migration — check the result and fix what the migrator flagged
---

# /archik:migrate — check what the deterministic migration did

`archik upgrade --migrate` already ran the **deterministic** migration:
it archived the old project, ran each pending step, validated, and
advanced `.archik/.version`. The current steps are:

- **#1** — move a legacy root `architecture.archik.yaml` into
  `.archik/main.archik.yaml`.
- **#3** — strip retired node fields (`stereotype`, `seqFiles`) from the
  model files.

(#2, the old use-case back-fill, is retired and never runs.)

The deterministic steps are done. Do NOT redo them. Your job is to check
the result against the **archived original** and fix anything the
migrator printed as needing judgment. `archik validate` is your gate.

## CLI-only for architecture

Interact with the architecture diagram only through `npx archik`. Never
edit `.archik/main.archik.yaml` by hand — changes go through
`suggest set` → `accept`. **Never delete `.archik.archive/`** — it is the
developer's only copy of the pre-migration project.

## Steps

1. **Read the migrator's output.** Any `ⓘ` line it printed is a task for
   you. If it printed none, the steps below are a quick check only.

2. **Find the archived original.**
   ```bash
   ls -t .archik.archive/        # newest timestamp dir is the pre-migration copy
   ```
   Read the files under that dir with the `Read` tool (the archive is a
   plain backup, not a live archik doc — reading it directly is correct).
   Note any old use case, sequence, or stereotype files there: their
   content is no longer modelled. Do not recreate them.

3. **Check the live model.**
   ```bash
   npx archik validate .archik/main.archik.yaml
   npx archik q stats
   npx archik drift
   npx archik smells
   ```

4. **Fix gaps through the normal workflow.** If drift or the archive
   shows structure the model misses (a node, an edge, a `parentId`
   container), stage it with `/archik:suggest`. Don't bulk-restructure.

## Done when

`archik validate` is clean, every `ⓘ` line from the migrator is
handled, and you proposed the natural next step (fix drift, cut a folder
loop that `smells` found). The archive stays untouched as the
developer's rollback.
