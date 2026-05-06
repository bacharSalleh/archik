---
description: Author a use case (actors + flows + slices + tests)
argument-hint: <use case name or id>
---

# /archik:usecase — author a `*.archik.uc.yaml`

The user wants you to author a **use case** that captures user-visible
behaviour as actors + flows + slices, with each active slice backed by
test paths on disk. The user-facing description is:

**$ARGUMENTS**

This slash command IS the user's confirmation. Skip "want me to draft
this?" and produce a use case file now.

## Direct-write — not the sidecar workflow

Use case files are authored with `Write` directly (unlike structural
sidecars which go through `suggest set`). After writing, validate via
`npx archik validate`. If validation fails, fix and re-write.

## This is the DESIGN (b) handoff of the engineering loop

The skill defines a 5-phase loop: **Discover → Design → Decide → Build
→ Verify**. This command covers Discover (ground in current actors and
use cases) and the Design (b) Requirements step. The output is a
reviewable artifact gated by **inline review** (you show the YAML in
chat, the user confirms) — *not* the canvas gate (that's only for
structural sidecars).

## Steps

0. **Frame + clarify.** Restate the user's intent in one sentence and
   ask 1–3 sharp clarifying questions if any of these are ambiguous in
   `$ARGUMENTS`:
   - **Primary actor** — who initiates this use case? (Will need to
     resolve in the actor index — check step 1 first.)
   - **Goal** — what does the actor want to accomplish in business
     terms (one sentence, observable outcome)?
   - **Pre / postconditions** — what must be true before/after? (Skip
     if obvious.)
   - **Slice scope** — happy path only, or also one or two alternates
     (e.g. payment-declined, validation-failed, retry)? Each slice =
     one flow subset + one test path.

   Skip questions `$ARGUMENTS` already answers. **Use judgment.**

1. **Ground in the current models.** Check who the actors are and
   what use cases exist already so you reuse rather than duplicate:
   ```
   npx archik q actors
   npx archik q usecases
   ```
   If the primary actor isn't in the actor index, STOP and tell the
   user — they need `/archik:actor <id>` first (or you offer to run
   it). Use cases without resolving actors fail validation.

2. **Lock in the schema:**
   ```
   npx archik schema uc
   ```
   Required fields: `id`, `name`, `primaryActor`, `goal`, `flows.basic`,
   at least one slice with `id`, `description`, `flows`, `tests`.
   Optional: `secondaryActors`, `preconditions`, `postconditions`,
   alternate flows, slice realization (`seqFile`).

3. **Write the file** to `.archik/usecases/<id>.archik.uc.yaml`. Use
   the `Write` tool — direct-write, no sidecar.

   **Slice test paths must exist on disk** for `status: active` slices.
   Validator rejects active slices whose test files are missing. If
   the test isn't written yet, mark the slice `status: proposed` —
   you'll flip it to `active` once the test lands in the BUILD phase.

   ```yaml
   version: "1.0"
   id: <kebab-id>
   name: <Human-readable name>
   primaryActor: <actor-id>     # must resolve in actors index
   goal: One sentence describing the observable outcome.
   preconditions: [<…optional…>]
   postconditions: [<…optional…>]
   flows:
     basic:
       steps:
         - "Actor does X."
         - "System does Y."
         - "Actor receives Z."
     alternates:
       - id: <kebab-id>
         branchFrom: basic.<step-number>
         steps: ["…"]
   slices:
     - id: happy
       description: One-line slice summary.
       flows: [basic]
       tests: [<path/to/test/file.spec.ts>]   # must exist OR slice must be `status: proposed`
   ```

4. **Validate:**
   ```
   npx archik validate
   ```
   Expect zero errors. If validation fails, the message names the
   field — fix and re-write. Common failures:
   - `primaryActor` doesn't resolve in actors index → ensure the
     actor file has that id
   - `flows.basic` missing → required by schema
   - `branchFrom` references unknown step → `basic.4` requires
     `flows.basic.steps` to have at least 4 entries
   - Slice tests path doesn't exist → either create the test file
     stub or mark the slice `status: proposed`

5. **Show inline + confirm.** Print the file's path and a short
   summary of what it covers (actor / number of flows / slice ids /
   test paths). Ask: "Looks right? Once you confirm, want me to
   stage the structural sidecar (`/archik:suggest`) for the nodes
   this use case implies?"

   Don't auto-proceed. The user's "looks good" IS the inline-review
   gate.

## Notes

- If the use case implies new structural nodes (a new service, a new
  external integration), the next step is `/archik:suggest` — that
  gate is separate.
- If the slice has non-trivial runtime branching, async fan-out, or
  cross-context interaction, plan for a `*.archik.seq.yaml` next that
  carries `realizes: { useCase: <id>, slice: <id> }` and binds
  participants to the structural nodes.
- Actor must exist BEFORE the use case file is written. Use cases
  reference `primaryActor` by id; the validator rejects dangling refs.
