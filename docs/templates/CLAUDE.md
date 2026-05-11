# Engineering loop

> Drop this file into any new project as `CLAUDE.md`. Then your very first message to me should be **`/archik:bootstrap`** — I'll detect what state the project is in (empty, has-code, already-modelled) and route to the right next step. If you already know what you want to build, you can append a one-line brief: `/archik:bootstrap <what you're building>`. I'll then run the loop below.
>
> **Framing that makes the rest of the loop work:** when I ask for your brief, end it with *"start by modelling the actors and the first use case I should ship."* That single line forces priorities into the open before any code lands — actors-first (you can't validate a use case without knowing who initiates it), pick exactly one (no "I might also want…"), and "to ship" (the use case names its test paths from message one; slices flip from `proposed` to `active` mechanically when those tests land in BUILD).

## How I work on this project

I move from **brief → requirements model → structural model → behavioral model → build plan → code**. Each model is a reviewable artifact, gated by a HITL accept before the next one is produced. If implementation invalidates a model, I stop coding and fix the model first.

The **requirements model** (actors + use cases + slices) says *who* acts and *what* they want. The **structural model** (archik diagram — nodes, edges, ECB stereotypes) says *what exists*. The **behavioral model** (`*.archik.seq.yaml`, one per slice, with a `realizes` block) says *how it behaves at runtime*. Code is the last artifact, not the first.

Three gate types, one per artifact class:

- **Inline review** — show YAML in chat, user confirms. Used for actors, use cases, and seq files.
- **Canvas gate** — `/archik:accept` on the rendered diff. Used only for the structural sidecar.
- **Plan gate** — user replies "approve". Used for the build plan before any code edits.

### Match ritual to scope

Not every task needs the full loop. Skip the modeling phases and just edit when the change is:

- A single-file script, a one-line config tweak, a typo / copy fix
- A pure refactor that doesn't change the component graph or any actor-visible behavior
- A bug fix inside an existing node that doesn't change its responsibility

Run the loop when the change introduces new behavior, a new structural shape, a new external interaction, or a new actor.

### The five-phase loop

**DISCOVER → DESIGN → DECIDE → BUILD → VERIFY**, with one critical back-edge: if BUILD reveals any model is wrong, stop coding and loop back to DESIGN.

- **DISCOVER** — `npx archik q stats / list / usecases / actors`, `ls` source dirs. Read before write.
- **DESIGN** — actors (if new) → use case → structural sidecar (with ECB stereotypes) → seq files (with `realizes`). Each is its own artifact with its own gate (see below).
- **DECIDE** — `/archik:accept` on the structural sidecar only. Other artifacts are confirmed inline during DESIGN.
- **BUILD** — numbered plan → "approve" → execute in small commits. Tests-first when the behavior is clearly bounded.
- **VERIFY** — validate, tests, lint, build, `archik trace`, eyeball UI. Stage the `proposed → active` flip. Promote alphas whose criteria are now met.

The **per-milestone rhythm** below is the actionable checklist that walks these phases step-by-step.

### Worked example — one slice end-to-end

User says: *"add password reset by email."*

I'd run the loop like this:

1. **DISCOVER** — `npx archik q usecases`, `npx archik q actors`, peek at `src/auth/`. Find that `customer` actor exists, no reset use case yet, an `auth-service` node already handles login.

2. **DESIGN (a) actors** — no new actor; skip.

3. **DESIGN (b) use case** — write `.archik/usecases/reset-password.archik.uc.yaml` with `primaryActor: customer`, basic flow (request → email sent → click link → set new password), one alternate (`token-expired`), and two slices: `happy` and `expired-token`. Each slice names its test path. Validate. Show inline → user confirms.

4. **DESIGN (c) structural** — `npx archik suggest set` adding two `proposed` nodes: a `reset-handler` (`stereotype: control`) and an `email-sender` (`stereotype: boundary` to the email provider, modelled as `external`). Existing `auth-service` already covers entity (passwords table). Two new edges: `reset-handler → email-sender (calls)`, `reset-handler → auth-service (writes)`. Wait for **`/archik:accept`** on the canvas.

5. **DESIGN (d) seq** — write `.archik/reset-password-happy.archik.seq.yaml` with `realizes: { useCase: reset-password, slice: happy }`. Participants: `customer`, `reset-handler`, `email-sender`, `auth-service`. Six messages. Validate. Show inline → user confirms.

6. **BUILD plan** — `src/auth/resetHandler.ts` (request + verify), `src/auth/emailSender.ts` (provider client), `tests/auth/reset.happy.spec.ts`, `tests/auth/reset.expired.spec.ts`. Each seq message maps to a function call. Out of scope: rate limiting (next milestone). Wait for "approve".

7. **Execute** — small commits. One per file roughly.

8. **VERIFY** — tests pass; `npx archik trace` shows `reset-password/happy ✓` and `reset-password/expired-token ✓`. Stage a sidecar flipping the two new nodes from `proposed → active` with `sourcePath`. Hand off.

The whole flow produces five reviewable artifacts before code lands. Each is small. None is optional once the loop applies.

## First message — project brief

The recommended opener is **`/archik:bootstrap`** (with or without an inline brief). The slash command detects project state and routes to the right next step automatically. If you skip the slash command and just send a brief, expect me to:

1. **Bootstrap or upgrade archik:**
   ```sh
   npx archik@latest init      # fresh project — creates .archik/main.archik.yaml + slash commands
   npx archik upgrade          # already installed — pulls latest, refreshes SKILL.md + slash commands
   ```
   Either path leaves the slash commands (`/archik:suggest`, `/archik:accept`, `/archik:usecase`, `/archik:actor`, `/archik:trace`, `/archik:alpha`, etc.) and the live canvas (`npx archik dev`) in place.

2. **Read the current state** with `ls -F`, `npx archik q list`, and `npx archik q usecases` (only relevant if archik is already populated).

3. **Surface genuine ambiguities** — usually 2–4 questions about scope, target users, hard constraints, or non-obvious tradeoffs. Skip questions whose answers are in the brief.

4. **Author the actors file** (direct-write) — who (human or system) initiates use cases. One `*.archik.actors.yaml` for the project. `kind: human | external-system | time | device`. Run `npx archik validate`. Show inline and wait for confirmation.

5. **Author the use cases** (direct-write) — what the actors want to accomplish. One `*.archik.uc.yaml` per use case under `.archik/usecases/`. Each includes a basic flow, alternate flows, and slices (a slice = a flow subset + the test paths that prove it). Active slices must name test files that will exist on disk when the code lands. Run `npx archik validate`. Show inline and wait for confirmation.

6. **Stage the structural model** via `npx archik suggest set` — every node the finished system needs, marked `status: proposed`, parented to a top-level `module`. Nodes participating in use case flows carry `stereotype: boundary | control | entity`. Wait for **`/archik:accept`** on the canvas (formal gate).

7. **Author the behavioral model** (direct-write) — one `.archik.seq.yaml` per slice that has a non-trivial runtime flow. Each seq file carries a `realizes: { useCase, slice }` block so the validator enforces bidirectional integrity. Participants bind to architecture node ids. Run `npx archik validate`. Show inline and wait for confirmation.

8. **The whole architecture lives on day one as `proposed`.** Milestones flip subsets from `proposed` to `active` (with `sourcePath`) as code lands. The set of nodes a milestone flips IS the milestone.

## Per-milestone rhythm

Every milestone follows the same shape. Three gate types apply — **inline review** (show YAML in chat, user confirms), **canvas gate** (`/archik:accept`), and **plan gate** ("approve"):

1. **Author actors** — `/archik:actor <id>` if this milestone introduces new actors. Updates `.archik/actors.archik.actors.yaml`, validates, shows inline; wait for user confirmation.
2. **Author use case** — `/archik:usecase <name>`. Writes a `*.archik.uc.yaml` with basic + alternate flows, slices, and test paths. Slices whose tests don't exist on disk yet start `status: proposed`. Validates, shows inline; wait for user confirmation.
3. **Structural sidecar** — `/archik:suggest <feature>`. Stages the proposed end-state for this milestone via `npx archik suggest set` under the hood. Tag participating nodes with `stereotype: boundary | control | entity`. Rationale in 2–4 bullets. Every node listed as a seq participant must declare the seq in its own `seqFiles` array (the validator catches missing backrefs).
4. **`/archik:accept` on the structural diagram** — formal canvas gate. This is the only artifact with a canvas diff review.
5. **Author seq files** (direct-write) — for each non-trivial slice, write a `.archik.seq.yaml` with a `realizes: { useCase, slice }` block. Run `npx archik validate` after every write. Show inline; wait for user confirmation.
6. **BUILD plan** — one-line goal, deps, files with paths and signatures, non-obvious bits, acceptance gate, out-of-scope items, the `proposed → active` flip this milestone will produce. For every seq diagram that realizes a slice: each message in the seq must map to a concrete function call in the plan — this is the traceability requirement.
7. **"approve" on the plan** — plan gate. Don't start editing files until approved.
8. **Execute** — small commits, narrate non-obvious decisions, declare back-edges to DESIGN openly when they happen.
9. **Verify** — project tests → lint → build → `/archik:trace` (or `npx archik trace`) → aesthetic eyeball (if UI). Trace must show no untraced active slices before the milestone closes; partials are tolerable mid-flight.
10. **Stage the `proposed → active` sidecar** — `/archik:suggest "flip <list> to active"`. Flips nodes/edges/slices with their `sourcePath` and `tests` now on disk.
11. **Hand off** — list what to eyeball; wait for `/archik:accept` and (if there's a deploy) confirm deploy is green. Then `/archik:alpha show` and promote any alpha whose criteria are now met.
12. **Commit + push** — only after the user confirms.

### When to author a sequence diagram

Author one when the milestone slice introduces:

- **Branching** — auth flows, conditional routing, retries with fallback.
- **Async fan-out** — one event triggers multiple subscribers.
- **Cross-context interaction** — three or more nodes participate in a single user-visible action.
- **External integrations with non-trivial handshake** — OAuth, webhook callbacks, idempotent retries.
- **Anything the user explicitly wants to spec before code** — even if it would otherwise be trivial.

Skip when: a single node handles the request end-to-end with no branching, or the slice is already covered by an existing seq file.

## Hard rules

1. **Requirements → structure → behavior → code. In that order.** Use cases define the scope of what to build. Structural nodes that participate in a use case flow carry ECB stereotypes. Behavioral seq files carry a `realizes` block. Code lands last.
2. **Three gate types, one per artifact class.** Actors, use cases, and seq files get an **inline review** (show YAML in chat, user confirms). The structural model gets a **canvas gate** (`/archik:accept`). The build plan gets an **approval gate** ("approve"). Don't conflate them — `/archik:accept` only works on structural sidecars.
3. **Active slices must be test-backed.** Each active slice in a use case declares the test paths that prove it. The validator rejects active slices with missing test files, mirroring `sourcePath` enforcement.
4. **Seq files carry a `realizes` block when linked to a slice.** The validator enforces bidirectional integrity — the use case's slice must name the seq file, and the seq file must reference that slice.
5. **ECB rules are enforced on realized seq diagrams.** Actors call boundaries; boundaries call controls; controls call entities or other controls. No direct actor → entity or entity → boundary messages.
6. **Stop at every milestone boundary.** Summarize what shipped, run verifications (`archik trace` must have no *untraced* active slices before the milestone closes — partials are tolerable mid-flight), ask for the visual ack before continuing.
7. **Boring underneath.** No experimental framework features unless explicitly requested. Match the stack the brief specifies.
8. **No scope creep.** Out-of-scope items go in `FUTURE.md`, not the current milestone.
9. **Back-edge from BUILD lands on whichever model is wrong.** If implementation reveals the structural model is wrong, fix the structural sidecar. If it reveals the behavioral model is wrong, edit the seq file. If it reveals the use case is wrong, update the uc file. Never paper over.
10. **Don't add comments that restate code.** Add a comment only when the WHY is non-obvious.

## What each phase produces

### DISCOVER
- `npx archik q stats` and `npx archik q list` to ground in the current diagram.
- `npx archik q usecases` and `npx archik q actors` to ground in the requirements model.
- `npx archik q sequences` to see flows already modelled.
- `ls -F` of relevant source dirs.
- A mental map of what exists vs what the request needs.
- No code, no diagram changes yet.

### DESIGN — (a) Actors
- One file: `*.archik.actors.yaml`. Separates human actors from system integrations.
- `kind: human | external-system | time | device`.
- Each actor has an `id`, a `description`, and optional `goals` (free text).
- Direct-write — no sidecar workflow. Validate with `npx archik validate`.

### DESIGN — (b) Requirements (use cases + slices)
- One `*.archik.uc.yaml` per use case under `.archik/usecases/`.
- Required fields: `id`, `name`, `primaryActor` (resolves in the actor index), `flows.basic`, at least one slice.
- Each slice: `id`, `description`, `flows` (which flows it covers), `tests` (array of on-disk test paths).
- Active slices with missing test files fail validation — same discipline as `sourcePath`.
- Optional: `realization.seqFile` per slice (set after the seq diagram is written).
- Schema: `npx archik schema uc`.

### DESIGN — (c) Structural
- One-line intent.
- 1–3 clarifying questions only when there's genuine ambiguity.
- A sidecar staged via `npx archik suggest set --note "..."` containing the **full proposed end-state**.
- New code-bearing nodes use `status: proposed` and may omit `sourcePath`.
- Nodes participating in a use case flow carry `stereotype: boundary | control | entity`.
- `description` on every node explains *what it does*, not *what kind it is*.
- Bounded contexts named explicitly; cross-context calls default to async unless there's a reason.
- Public traffic routes through a `gateway`/`auth` node, not directly to a service.

**ECB completeness check** — before staging the sidecar, run through
each active use case slice and verify the structural model has all
three ECB roles covered (each must carry the matching `stereotype`
field):
- A **boundary** node (`stereotype: boundary`) — the entry point the
  actor touches: API handler, gateway, BFF. Missing = the slice has
  no identified entry point; the actor has nowhere to call.
- A **control** node (`stereotype: control`) — the orchestrator that
  runs the use case logic: service, use-case handler, workflow engine.
  Missing = logic will bleed into the boundary or entity.
- An **entity** node (`stereotype: entity`) — persistent state:
  repository, domain model, DB-backed store. Missing for a
  state-changing slice = the persistence concern is unmodelled.

If any ECB role is absent, add the missing node (`status: proposed`
if not yet built) and tag it with the correct `stereotype` before
staging. An incomplete ECB model at structural-design time produces
ECB rule violations when the seq diagram is validated.

### DESIGN — (d) Behavioral
- One `.archik.seq.yaml` per non-trivial slice.
- Carries `realizes: { useCase: <id>, slice: <id> }` at the top level.
- Participants bound to architecture node ids that exist in the structural model.
- Messages typed correctly: `sync` / `async` / `return` / `create` / `destroy`.
- Branches modelled with `alt` / `opt` / `loop` groups; large flows via `ref` groups.
- `npx archik validate` run after every write — catches broken `nodeId` refs, duplicate step ids, and ECB rule violations.
- Linked from the relevant architecture node via `seqFiles` (this part goes through the structural sidecar).

### DECIDE
- The user runs `/archik:accept` (apply) or `/archik:reject` (with a reason).
- On reject: ask one specific question pinned to one axis — boundary / relationship / scope / naming / composition / lifecycle. Treat the answer as a hard constraint, re-stage. Never silently retry the same draft.
- Each model is its own gate.

### BUILD
- A numbered file-level plan, presented before any edit:
  - Each new code-bearing node → its `sourcePath` and the concrete files / signatures.
  - Each new edge that requires code → the corresponding code change.
  - Each accepted seq diagram → trace it: every message in the flow must map to a function call in the plan.
  - Slice test paths declared in the use case → scaffold those test files.
  - Default to **tests-first** when the behavior is clearly bounded.
  - Out-of-scope items called out explicitly.
- Wait for "approve" before editing.
- Small, reversible commits — one diagram delta per commit where practical.

### VERIFY
1. Project tests — all passing.
2. Lint — clean.
3. Build / typecheck — clean.
4. `npx archik validate` — schema + cross-file + ECB checks clean.
5. `npx archik trace` — no untraced active slices. `--fail-on partial` for CI gates.
6. `npx archik drift` — structural model matches disk.
7. Aesthetic eyeball when there's a UI — share a screenshot, ask before declaring done.
8. Stage the `proposed → active` sidecar — flip nodes/edges with `sourcePath`.
9. After the user accepts: run `npx archik alpha show` and promote any alpha whose criteria are now met.
10. Commit (with a Co-Authored-By line) and push — only after user confirms.

## Archik commands I use

**Reading the models:**
- `npx archik q list | edges | describe <id> | dependents <id> | impact <id>` — structural model.
- `npx archik q sequences [--node <id>]` — seq flows.
- `npx archik q stats` — node + edge counts.
- `npx archik q usecases [--actor <id>]` — use cases; `--actor` filters.
- `npx archik q describe-usecase <id>` — one use case in detail.
- `npx archik q actors` — actor index.

**Authoring:**
- `npx archik schema` — once before authoring any sidecar.
- `npx archik schema uc` — use case schema.
- `npx archik schema actors` — actors schema.
- `npx archik suggest set --note "<one-liner>" - <<'YAML' ... YAML` — stage a structural sidecar (full document).
- Direct `Write` / `Edit` on `*.archik.actors.yaml`, `*.archik.uc.yaml`, `*.archik.seq.yaml` — these have no sidecar workflow.

**Lifecycle:**
- `npx archik suggest accept | reject | show` — structural sidecar lifecycle.
- `npx archik validate` — schema + cross-file + ECB checks.
- `npx archik trace [--json] [--fail-on partial|none]` — coverage matrix: use case × slice × test × seq × ECB.
- `npx archik alpha show` — alpha state snapshot with verification badges.
- `npx archik alpha promote <alpha> <state> [--note <text>]` — promote with machine-checkable gate.

**Verification & rendering:**
- `npx archik drift` — source paths that no longer exist on disk.
- `npx archik render --out docs/architecture.svg` — regenerate committed SVG.
- `npx archik render --seq <path> --out <file>` — render a seq diagram to SVG.

## Common pitfalls

- **Editing `.archik/main.archik.yaml` by hand** — forbidden; always go through `suggest set`.
- **Skipping actors before use cases** — actors must exist before use cases can reference `primaryActor`.
- **Active slices without on-disk test paths** — validator rejects them. Use `status: proposed` for slices whose tests aren't written yet.
- **Seq file missing `realizes` block** — when a slice declares `realization.seqFile`, that seq file must carry the matching `realizes` block. The validator checks both directions.
- **Seq participants missing the `seqFiles` backref on the architecture node** — when you write a `realizes`-bound seq, every architecture node listed as a participant must also declare that seq in its own `seqFiles` array. Otherwise the seq is "linked from the requirements side, orphaned from the structural side" — `archik validate` rejects it. When staging the structural sidecar that hosts the participants, add `seqFiles: [.archik/<flow>.archik.seq.yaml]` to each. Closes the third side of the integrity triangle (use case ↔ seq ↔ node).
- **ECB violations in realized seq diagrams** — actor → boundary → control → entity is the allowed chain. `npx archik validate` catches violations at error level.
- **Skipping the behavioral model when the slice has branching or async** — write the seq diagram; future Claude reads it.
- **Writing prose-only summaries instead of staging a sidecar** — every structural change must produce a reviewable artifact.
- **Skipping the BUILD-plan HITL** — use case + diagram acceptance is not implicit code approval.
- **Renaming an `id` mid-flow** — forbidden; remove the old and add a new one. Renames break diff, seq participant bindings, and use case actor references.
- **Letting `archik trace` show untraced active slices at ship time** — partial is a warning; untraced is a gap. Fix before the milestone closes.
- **Over-claiming an alpha state** — `archik alpha show` marks it `✗ over-claimed`. Either fix the artifacts or demote the state.

## Working with this file

- This is `CLAUDE.md`. Future Claude sessions read it first.
- I add an `@AGENTS.md` line at the top if the project has framework-specific agent rules.
- I add project-specific sections under `## Stack` and `## File / module layout` once the architecture stabilizes — they replace the generic guidance with concrete file paths.
- Four artifacts, one project: this file is the **rhythm**, the archik diagram is the **structural model**, the use cases + actors are the **requirements model**, the seq files are the **behavioral model**, the code is the **implementation**. The rhythm threads them together.
