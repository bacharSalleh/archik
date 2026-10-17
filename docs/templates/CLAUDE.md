# Engineering loop

> Drop this file into any new project as `CLAUDE.md`. Then your very first message to me should be **`/archik:bootstrap`** — I'll detect what state the project is in (empty, has-code, already-modelled) and route to the right next step. If you already know what you want to build, you can append a one-line brief: `/archik:bootstrap <what you're building>`. I'll then run the loop below.
>
> **Framing that makes the rest of the loop work:** when I ask for your brief, end it with *"start by modelling the smallest structure for the first thing I should ship."* That single line forces priorities into the open before any code lands — pick exactly one (no "I might also want…"), and "to ship" (new nodes start `proposed` and flip to `active` when their code lands in BUILD).

## How I work on this project

I move from **brief → structural model → build plan → code**. Each step is a reviewable artifact, gated by a HITL accept before the next one is produced. If implementation invalidates the model, I stop coding and fix the model first.

The **structural model** (archik diagram — nodes, nesting via `parentId` and sub-files, edges) says *what exists* and *which way dependencies flow*. **Decision records** in `.archik/decisions/` say *why* it is shaped that way — one per accepted change. `archik drift` and `archik smells` check it against the real code. Code is the last artifact, not the first.

Two gate types:

- **Canvas gate** — `/archik:accept` on the rendered diff. Used for the structural sidecar.
- **Plan gate** — user replies "approve". Used for the build plan before any code edits.

### Match gates to reversibility

`archik suggest set` labels every change a **one-way door** (hard to undo) or a **two-way door** (easy to undo):

- **One-way door** — adds a data store, queue/stream, external system, gateway/auth/cdn, cloud or LLM node, a new edge to an external system, a top-level module; or removes a built node or moves one to another parent. Two separate stops: canvas gate first, then the plan gate. If it adds data, an outside system or public traffic, the decision record must also say how it is **secured, observed and rolled back** (`crossCutting`) — `suggest set` refuses it otherwise.
- **Two-way door** — everything else (an internal function, a new edge inside a module, a description, a lifecycle flip). One stop: stage the sidecar and show the build plan in the same message; `/archik:accept` approves both.

### Match ritual to scope

Not every task needs the full loop. Skip the modeling phases and just edit when the change is:

- A single-file script, a one-line config tweak, a typo / copy fix
- A pure refactor that doesn't change the component graph or any user-visible behavior
- A bug fix inside an existing node that doesn't change its responsibility

Run the loop when the change introduces new behavior, a new structural shape, or a new external interaction.

### The five-phase loop

**DISCOVER → DESIGN → DECIDE → BUILD → VERIFY**, with one critical back-edge: if BUILD reveals the model is wrong, stop coding and loop back to DESIGN.

- **DISCOVER** — `npx archik q stats / list`, `npx archik smells`, `ls` source dirs. Read before write.
- **DESIGN** — structural sidecar plus its decision record (context, decision, alternatives, consequences).
- **DECIDE** — `/archik:accept` on the structural sidecar. Accept writes the decision record.
- **BUILD** — numbered plan → "approve" → execute in small commits. Tests-first when the behavior is clearly bounded.
- **VERIFY** — validate, tests, lint, build, `archik drift`, `archik smells`, eyeball UI. Stage the `proposed → active` flip.

The **per-milestone rhythm** below is the actionable checklist that walks these phases step-by-step.

### Worked example — one feature end-to-end

User says: *"add password reset by email."*

I'd run the loop like this:

1. **DISCOVER** — `npx archik q list`, `npx archik q describe auth-service`, peek at `src/auth/`. Find that an `auth-service` node already handles login.

2. **DESIGN** — `npx archik suggest set` adding two `proposed` nodes under the `auth` module: a `reset-handler` and an `email-sender` that talks to the email provider (modelled as `external`). Two new edges: `reset-handler → email-sender (calls)`, `reset-handler → auth-service (writes)`. Dependencies flow one way — nothing in `auth-service` imports the handler. The draft's decision record: *context* — users who lose their password open support tickets; *decision* — self-service reset by emailed one-time link; *alternatives* — admin-only reset, SMS codes; *consequences* — we now depend on an email provider and must expire tokens. It adds an external system, so `suggest set` calls it a **one-way door** and the record also needs *crossCutting*: tokens are single-use and expire in 15 minutes, the provider key lives in the secret store (security); reset requests and send failures are counted and alerted (observability); a feature flag turns the reset link off (rollback). Wait for **`/archik:accept`** on the canvas; accept writes `.archik/decisions/0004-password-reset-by-email.md`.

3. **BUILD plan** — `src/auth/resetHandler.ts` (request + verify), `src/auth/emailSender.ts` (provider client), `tests/auth/reset.happy.spec.ts`, `tests/auth/reset.expired.spec.ts`. Each new edge maps to a real call. Out of scope: rate limiting (next milestone). Wait for "approve".

4. **Execute** — small commits. One per file roughly.

5. **VERIFY** — tests pass; `npx archik drift` is clean; `npx archik smells` shows no new folder loop. Stage a sidecar flipping the two new nodes from `proposed → active` with `sourcePath`. Hand off.

The flow produces two reviewable artifacts (diagram, plan) before code lands. Each is small. Neither is optional once the loop applies.

## First message — project brief

The recommended opener is **`/archik:bootstrap`** (with or without an inline brief). The slash command detects project state and routes to the right next step automatically. If you skip the slash command and just send a brief, expect me to:

1. **Bootstrap or upgrade archik:**
   ```sh
   npx archik@latest init      # fresh project — creates .archik/main.archik.yaml + slash commands
   npx archik upgrade          # already installed — pulls latest, refreshes SKILL.md + slash commands
   ```
   Either path leaves the slash commands (`/archik:suggest`, `/archik:accept`, `/archik:evolve`, etc.) and the live canvas (`npx archik dev`) in place.

2. **Read the current state** with `ls -F`, `npx archik q list` (only relevant if archik is already populated), and `npx archik smells` (when code exists).

3. **Surface genuine ambiguities** — usually 2–4 questions about scope, target users, hard constraints, or non-obvious tradeoffs. Skip questions whose answers are in the brief.

4. **Stage the structural model** via `npx archik suggest set` — the **first milestone in detail** (every node and edge it needs, `status: proposed`), and the rest of the system as a few coarse `module` placeholders (one per later area, `status: proposed`, one-line description). Wait for **`/archik:accept`** on the canvas (formal gate).

5. **Detail grows with the work.** Don't model what you can't yet know. Each milestone first details its own area (a sidecar that replaces the placeholder's insides), then flips those nodes from `proposed` to `active` (with `sourcePath`) as code lands. The set of nodes a milestone flips IS the milestone.

## Per-milestone rhythm

Every milestone follows the same shape. Two gate types apply — **canvas gate** (`/archik:accept`) and **plan gate** ("approve") — merged into one stop for two-way doors:

1. **Structural sidecar** — `/archik:suggest <feature>`. Stages the proposed end-state for this milestone via `npx archik suggest set` under the hood, with its decision record. Note whether `suggest set` called it a one-way or two-way door.
2. **`/archik:accept` on the structural diagram** — formal canvas gate.
3. **BUILD plan** — one-line goal, deps, files with paths and signatures, non-obvious bits, acceptance gate, out-of-scope items, the `proposed → active` flip this milestone will produce. Each new edge must map to a real call in the plan. For a one-way door with `crossCutting`, the plan also lands what it promised: the security control, the signal you will watch, the rollback path.
4. **"approve" on the plan** — plan gate. Don't start editing files until approved. *Two-way door:* steps 1–4 collapse — show the plan together with the sidecar, and `/archik:accept` approves both.
5. **Execute** — small commits, narrate non-obvious decisions, declare back-edges to DESIGN openly when they happen.
6. **Verify** — project tests → lint → build → `npx archik drift` → `npx archik smells` → aesthetic eyeball (if UI). No **new** folder loop or oversized file should close the milestone (with a committed baseline, `smells` marks them NEW). For a one-way door, check the `crossCutting` promises exist in the code before the flip to `active`.
7. **Stage the `proposed → active` sidecar** — `/archik:suggest "flip <list> to active"`. Flips nodes/edges with their `sourcePath` now on disk. Its decision record is short: what landed, and that drift now checks it.
8. **Hand off** — list what to eyeball; wait for `/archik:accept` and (if there's a deploy) confirm deploy is green.
9. **Commit + push** — only after the user confirms.

## Hard rules

1. **Structure → plan → code. In that order.** The accepted diagram defines what to build. Code lands last.
2. **Gates match reversibility.** One-way doors get two stops: a **canvas gate** (`/archik:accept`) on the model, then an **approval gate** ("approve") on the plan. Two-way doors get one stop: sidecar and plan shown together, one `/archik:accept`. Never skip review of a one-way door to save time.
3. **Dependencies flow one way.** Sibling folders must not import each other. `npx archik smells` reports folder loops with the real imports as evidence — fix them, don't invent labels for them.
4. **Stop at every milestone boundary.** Summarize what shipped, run verifications (`archik drift` and `archik smells`), ask for the visual ack before continuing.
5. **Boring underneath.** No experimental framework features unless explicitly requested. Match the stack the brief specifies.
6. **No scope creep.** Out-of-scope items go in `FUTURE.md`, not the current milestone.
7. **Back-edge from BUILD lands on the model.** If implementation reveals the structural model is wrong, fix it with a fresh sidecar. Never paper over.
8. **Every structural change says why.** Each sidecar carries a decision record; accept writes it to `.archik/decisions/`. Records are never edited — to change course, a new record lists the old numbers in `supersedes`.
9. **Don't add comments that restate code.** Add a comment only when the WHY is non-obvious.

## What each phase produces

### DISCOVER
- `npx archik q stats` and `npx archik q list` to ground in the current diagram.
- `npx archik smells` to see folder loops and oversized files in the code.
- Past decision records in `.archik/decisions/` for the area you will touch — don't undo a choice without knowing why it was made.
- `ls -F` of relevant source dirs.
- A mental map of what exists vs what the request needs.
- No code, no diagram changes yet.

### DESIGN
- One-line intent.
- 1–3 clarifying questions only when there's genuine ambiguity.
- A sidecar staged via `npx archik suggest set --note "..."` containing the **full proposed end-state**.
- A decision record in the draft (`metadata.suggestion.decision`): **context** (the problem and forces, not the solution), **decision**, **alternatives** (at least one real option not chosen), **consequences** (what gets easier *and* harder). `suggest set` refuses a draft without it.
- For changes that add data, an outside system or public traffic: `crossCutting` with **security** (who can reach it, secrets, data exposure), **observability** (how you will see it work or fail) and **rollback** (how to undo it safely).
- Model only what this milestone needs in detail; later areas stay coarse placeholders.
- New code-bearing nodes use `status: proposed` and may omit `sourcePath`.
- Containers via `parentId`; a big subsystem gets its own sub-file via `archikFile`.
- `description` on every node explains *what it does*, not *what kind it is*.
- Bounded contexts named explicitly; cross-context calls default to async unless there's a reason.
- Public traffic routes through a `gateway`/`auth` node, not directly to a service.

### DECIDE
- The user runs `/archik:accept` (apply) or `/archik:reject` (with a reason).
- On accept: the decision record lands in `.archik/decisions/NNNN-<slug>.md`, with the model change listed as evidence.
- On reject: ask one specific question pinned to one axis — boundary / relationship / scope / naming / composition / lifecycle. Treat the answer as a hard constraint, re-stage. Never silently retry the same draft.

### BUILD
- A numbered file-level plan, presented before any edit:
  - Each new code-bearing node → its `sourcePath` and the concrete files / signatures.
  - Each new edge that requires code → the corresponding code change.
  - Default to **tests-first** when the behavior is clearly bounded.
  - Out-of-scope items called out explicitly.
- Wait for "approve" before editing.
- Small, reversible commits — one diagram delta per commit where practical.

### VERIFY
1. Project tests — all passing.
2. Lint — clean.
3. Build / typecheck — clean.
4. `npx archik validate` — schema + cross-file + constraint checks clean.
5. `npx archik drift` — structural model matches disk.
6. `npx archik smells` — no **new** folder loops or oversized files. On existing code, run `npx archik smells --update-baseline` once and commit `.archik/smells-baseline.json`; `--fail-on-warn` then fails CI only on new findings. Tighten the baseline when findings are fixed.
7. For one-way doors: the record's `crossCutting` promises (security control, signal, rollback path) exist in the code.
8. Aesthetic eyeball when there's a UI — share a screenshot, ask before declaring done.
9. Stage the `proposed → active` sidecar — flip nodes/edges with `sourcePath`.
10. Commit (with a Co-Authored-By line) and push — only after user confirms.

## Archik commands I use

**Reading the models:**
- `npx archik q list | edges | describe <id> | dependents <id> | impact <id>` — structural model.
- `npx archik q stats` — node + edge counts.
- `npx archik affected [--since <ref>]` — changed files → nodes and their dependents.

**Authoring:**
- `npx archik schema` — once before authoring any sidecar.
- `npx archik suggest set --note "<one-liner>" - <<'YAML' ... YAML` — stage a structural sidecar (full document).

**Lifecycle:**
- `npx archik suggest accept | reject | show` — structural sidecar lifecycle. Accept writes the decision record.
- `npx archik validate` — schema + cross-file + constraint checks.

**Verification & rendering:**
- `npx archik drift` — source paths that no longer exist on disk.
- `npx archik smells [--fail-on-warn]` — folder import loops + oversized files, with import evidence.
- `npx archik render --out docs/architecture.svg` — regenerate committed SVG.

## Common pitfalls

- **Editing `.archik/main.archik.yaml` by hand** — forbidden; always go through `suggest set`.
- **Writing prose-only summaries instead of staging a sidecar** — every structural change must produce a reviewable artifact.
- **Skipping the BUILD-plan HITL** — diagram acceptance is not implicit code approval.
- **A decision record with only upsides** — consequences must name what gets harder too; alternatives must be options you really weighed.
- **Editing an old decision record** — records are history. Stage a new decision that `supersedes` it.
- **Renaming an `id` mid-flow** — forbidden; remove the old and add a new one. Renames break diff and require manual re-link in code.
- **Labelling a smell without evidence** — name a folder loop by the imports `archik smells` shows, not by a made-up category.

## Working with this file

- This is `CLAUDE.md`. Future Claude sessions read it first.
- I add an `@AGENTS.md` line at the top if the project has framework-specific agent rules.
- I add project-specific sections under `## Stack` and `## File / module layout` once the architecture stabilizes — they replace the generic guidance with concrete file paths.
- Three artifacts, one project: this file is the **rhythm**, the archik diagram is the **structural model**, the code is the **implementation**. The rhythm threads them together.
