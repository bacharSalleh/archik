# Engineering loop

> Drop this file into any new project as `CLAUDE.md`. Send the next message as a project brief — what you want to build, why, the constraints. I'll bootstrap archik, propose the target architecture, and run the loop below.

## How I work on this project

Every structural change runs a five-phase loop. I don't skip phases, don't silently retry on rejection, and don't paper over a wrong design mid-build. If implementation invalidates the design, I stop coding and fix the diagram first.

```
  ┌────────────┐  npx archik q stats / list / source tree.
  │  DISCOVER  │  Read before write. Map intent onto what exists.
  └─────┬──────┘
        │
  ┌─────▼──────┐  One-line intent + 1–3 sharp clarifying Qs.
  │   DESIGN   │  Stage sidecar (`npx archik suggest set`) with
  │            │  rationale: bounded contexts, sync vs async,         ◄── reject + reason ──┐
  └─────┬──────┘  composition, alternatives rejected.                                       │
        │                                                                                   │
  ┌─────▼──────┐                                                                            │
  │   DECIDE   │  Canvas diff: accept | reject (why?) | revise. ───────────────────────────►┤
  └─────┬──────┘                                                                            │
        │ accept                                                                            │
  ┌─────▼──────┐  BUILD plan (HITL approval) → Implement → Self-review.                     │
  │   BUILD    │  Small reversible commits, one delta each. Tests-first when the            │
  │            │  behaviour is clearly bounded. If implementation invalidates the design ──►┘
  └─────┬──────┘  loop back to DESIGN — don't paper over.
        │
  ┌─────▼──────┐  Validate; tests; lint; build; aesthetic eyeball.
  │   VERIFY   │  Stage the next sidecar that flips shipped nodes
  └────────────┘  from `proposed` → `active` with sourcePath.
```

## First message — project brief

When you send the brief, expect me to:

1. **Bootstrap archik** if it's not already installed:
   ```sh
   npx archik@latest init
   ```
   That installs the slash commands (`/archik:suggest`, `/archik:accept`, etc.), creates `.archik/main.archik.yaml`, and registers the live canvas (`npx archik dev`).

2. **Read the current source tree** with `ls -F` and `npx archik q list` (only relevant if archik is already populated).

3. **Surface genuine ambiguities** — usually 2–4 questions about scope, target users, hard constraints, or non-obvious tradeoffs. Skip questions whose answers are in the brief.

4. **Stage the target architecture** as a sidecar: every node that the finished system needs, marked `status: proposed`, parented to a top-level `module` that represents the app. Code-bearing kinds (service, function, worker, module, page, component, store, hook) get a `sourcePath` once the code exists; before that, they stay `proposed`.

5. **Encode milestones** in node `notes`. The whole architecture lives on day one as `proposed`; milestones flip subsets to `active` as code lands.

6. **Wait for `/archik:accept`** before writing any code.

## Per-milestone rhythm

Every milestone follows the same shape in chat:

1. **BUILD plan** — one-line goal, deps to add, files to land with paths and signatures, non-obvious bits, acceptance gate, out-of-scope items, the diagram delta this milestone will trigger
2. **Wait for "approve"**
3. **Execute** — small commits, narrate non-obvious decisions, declare back-edges to DESIGN openly when they happen
4. **Verify** — run the project's test/lint/build in that order; clean = green, anything else means not done
5. **Stage the diagram update** — `npx archik suggest set` flipping the relevant nodes to `active` with their `sourcePath`
6. **Hand off** — list what to eyeball; wait for the user to `/archik:accept` and (if there's a deploy) confirm the deploy is green
7. **Commit + push** — only after the user confirms

## Hard rules

1. **The archik diagram is the source of truth for shape.** New components, workers, routes, external integrations all start as `status: proposed` nodes. Code lands → flip to `active` with `sourcePath`. The tool is `npx archik` — never edit `.archik/*.yaml` by hand.
2. **HITL twice per milestone.** Once on the diagram (DECIDE) and once on the BUILD plan (before any code is written). Don't start editing files based on an accepted diagram alone — the plan is its own gate.
3. **Stop at every milestone boundary.** Summarize what shipped, run verifications, ask for the visual ack before continuing. UI ugly = milestone failed; redo before moving on.
4. **Boring underneath.** No experimental framework features, no canary builds, no clever monorepo tricks unless explicitly requested. Match the stack the brief specifies; don't propose alternatives unless blocking.
5. **No scope creep.** Out-of-scope items go in `FUTURE.md`, not the current milestone. Push back if a feature request would jump milestone boundaries.
6. **Don't add comments that restate code.** Add a comment only when the WHY is non-obvious (a hidden constraint, a workaround for a specific bug). Never reference the current task or commit in comments.

## What each phase produces

### DISCOVER
- `npx archik q stats` and `npx archik q list` to ground in the current diagram
- `ls -F` of relevant source dirs
- A mental map of what exists vs what the request needs
- No code, no diagram changes yet

### DESIGN
- One-line intent
- 1–3 clarifying questions only when there's genuine ambiguity (not "to be safe")
- A sidecar staged via `npx archik suggest set --note "..."` containing the **full proposed end-state** (every node, every edge — archik computes the diff)
- New code-bearing nodes use `status: proposed` and may omit `sourcePath`
- `description` on every node explains *what it does* (responsibility, behavior), not *what kind it is*
- Bounded contexts named explicitly; cross-context calls default to async unless there's a reason
- Public traffic routes through a `gateway`/`auth` node, not directly to a service

### DECIDE
- The user runs `/archik:accept` (apply) or `/archik:reject` (with a reason on one of: boundary / relationship / scope / naming / composition)
- On reject: ask one specific question, treat the answer as a hard constraint, re-stage. Never silently retry the same draft.

### BUILD
- A numbered file-level plan, presented before any edit:
  - Each new code-bearing node → its `sourcePath` and the concrete files / signatures
  - Each new edge that requires code → the corresponding code change (a new `http_call` needs a client; `subscribes` needs a consumer; `writes` needs a repository method)
  - Default to **tests-first** when the behavior is clearly bounded
  - Out-of-scope items called out explicitly
- Wait for "approve" before editing
- Small, reversible commits — one diagram delta per commit where practical, no drive-by refactors
- **Back-edge to DESIGN:** if implementation reveals the diagram is wrong (a missing port, a hidden dependency, a boundary that doesn't hold), STOP. Open a fresh `npx archik suggest` to fix the diagram first, then resume.

### VERIFY
1. Project tests — all passing
2. Lint — clean
3. Build / typecheck — clean
4. Aesthetic eyeball when there's a UI — share a screenshot, ask before declaring done
5. Stage a second sidecar that flips the relevant nodes/edges from `proposed` → `active` with `sourcePath`
6. After the user accepts that sidecar: commit (with a Co-Authored-By line) and push

## Archik commands I use

- `npx archik schema` — once before authoring any sidecar; the schema is the contract
- `npx archik q list | edges | describe <id> | dependents <id> | impact <id>` — read the diagram
- `npx archik q sequences [--node <id>]` — list sequence flows; `--node` filters to flows involving a given node
- `npx archik suggest set --note "<one-liner>" - <<'YAML' ... YAML` — stage a sidecar (full document, not a patch)
- `npx archik suggest accept | reject | show` — lifecycle
- `npx archik validate` — schema + cross-file check (catches broken nodeId refs in seq files too)
- `npx archik render --out docs/architecture.svg` — regenerate committed SVG if the project keeps one
- `npx archik render --seq <path> --out <file>` — render a sequence diagram to SVG for visual review
- `npx archik drift` — check for source paths that no longer exist on disk

## Common pitfalls

- Editing `.archik/main.archik.yaml` by hand — forbidden; always go through the CLI.
- Writing prose-only summaries instead of staging a sidecar — every structural change must produce a reviewable sidecar.
- Skipping the BUILD-plan HITL — the diagram acceptance is not implicit code approval.
- Renaming an `id` mid-flow — forbidden; remove the old node and add a new one (renames break diff and require manual re-link in code).
- Calling the diagram done at "accepted" without a follow-up — always end with one concrete next-step: implement, evolve, drift-check, or render.
- Letting performance regress (canvas fps, request latency, build size) without flagging it — performance is part of "done" when the brief says so.
- Authoring a seq file whose participants reference node ids that don't exist in the architecture — always run `npx archik validate` after creating a new `.archik.seq.yaml` file.
- Renaming an architecture node without updating seq file participant `nodeId` bindings — `npx archik validate` catches this, but fix before committing.

## Working with this file

- This is `CLAUDE.md`. Future Claude sessions read it first.
- I add an `@AGENTS.md` line at the top if the project has framework-specific agent rules (e.g. Next.js's `node_modules/next/dist/docs/`).
- I add project-specific sections under `## Stack` and `## File / module layout` once the architecture stabilizes — they replace the generic guidance with concrete file paths.
- This file is the rhythm; the archik diagram is the shape; the code is the implementation. Three artifacts, one project.
