---
description: Add or update an actor in the actor index
argument-hint: <actor id> [— description]
---

# /archik:actor — author an entry in `*.archik.actors.yaml`

The user wants you to add (or update) an actor in the project's actor
index. Actors are *who* initiates use cases — humans (end users,
operators, customers) or non-human systems (other services, schedulers,
external APIs). The user-facing description is:

**$ARGUMENTS**

This slash command IS the user's confirmation. Skip "want me to add
this?" and produce the change now.

## Direct-write — not the sidecar workflow

Actors live in `.archik/actors.archik.actors.yaml` (one file per
project, conventionally). Authored with `Write` / `Edit` directly,
then validated via `npx archik validate`.

## Steps

0. **Frame.** Restate the user's intent in one sentence and ask 1–2
   sharp questions only if any of these are unclear:
   - **Actor kind** — `human` (end user / operator / customer),
     `external-system` (third-party service we don't own),
     `time` (scheduler / cron), or `device` (sensor / hardware)?
   - **Goals** — one short sentence per goal the actor pursues
     against this system. Optional but useful.

   Skip questions `$ARGUMENTS` already answers.

1. **Ground in current actors:**
   ```
   npx archik q actors
   ```
   If the id already exists, this is an UPDATE — read the existing
   entry's fields and preserve everything the user didn't ask to
   change. Otherwise it's a NEW addition.

2. **Lock in the schema:**
   ```
   npx archik schema actors
   ```
   Required: `id`, `kind`, `description`. Optional: `goals`.

3. **Edit the file.** If `.archik/actors.archik.actors.yaml` doesn't
   exist yet, `Write` a new file with the standard header. If it
   exists, `Edit` to add/update the one actor you're touching — do
   NOT rewrite the whole file unless you're consolidating.

   ```yaml
   version: "1.0"
   actors:
     - id: <kebab-id>
       kind: human          # human | external-system | time | device
       description: One sentence — who they are and why they touch the system.
       goals:
         - "Verb-first short outcome they pursue."
   ```

4. **Validate:**
   ```
   npx archik validate
   ```
   Common failures:
   - Duplicate `id` across actor files
   - Missing `description` (required, non-empty)
   - `kind` not in the allowed enum

5. **Confirm inline.** Print the actor's id, kind, and description.
   Ask: "Looks right? Want me to author a use case (`/archik:usecase`)
   that has this actor as `primaryActor`?"

   Don't auto-proceed. Inline-review gate.

## Notes

- Actors must exist BEFORE any use case can reference them. The
  use case validator rejects dangling `primaryActor` / `secondaryActors`
  references with the actor id named in the error.
- The `external` node kind in the structural model is for third-party
  systems that participate in the *runtime* graph. The `external-system`
  actor kind is for systems that *initiate* use cases. They overlap
  conceptually but live in different files — actor file for "who acts
  on us", structural file for "what we integrate with".
