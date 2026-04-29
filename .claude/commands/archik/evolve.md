---
description: Propose a cleaner modular refactor
argument-hint: [optional focus area]
---

# /archik:evolve — propose a cleaner, bounded architecture

The user wants you to look at the current diagram with a critical
eye and **propose a refactor toward a cleaner modular architecture
with clear bounded contexts**. Stage the proposal as a sidecar so
the diff overlay highlights what would change, then **wait for the
user to discuss before they accept** — evolve is a conversation,
not a one-shot.

If `$ARGUMENTS` is non-empty, treat it as the area to focus on
(e.g. *"payments domain"*, *"the orders module"*, *"async wiring
between services"*). If empty, evaluate the whole diagram.

## CLI-only — do not touch archik files directly

You MUST interact with archik exclusively through the `npx archik`
CLI. Drafts go to a workspace temp file, then `npx archik suggest
set` stages them. Do NOT use `Read`, `Write`, or `Edit` against
any file under `.archik/`.

## Steps

1. **Make sure the canvas is running**: `npx archik status` →
   `npx archik start` if needed. Note the URL for step 6.

2. **Ground yourself in the current shape** via the query CLI:
   ```
   npx archik q stats
   npx archik q list
   npx archik q edges
   ```
   If `$ARGUMENTS` names a specific area, also:
   ```
   npx archik q describe <id>
   npx archik q deps <id>
   npx archik q dependents <id>
   npx archik q impact <id>
   ```
   Refuse politely and stop if the diagram has fewer than 3 nodes
   — there's nothing meaningful to evolve. Suggest `/archik:spawn`
   first.

3. **Identify smells and missing structure.** Don't propose change
   for change's sake — every modification should fix one of:

   - **Bounded contexts unclear.** Several services share a
     domain language but aren't grouped → wrap in a `module`
     container per context.
   - **God service.** One node owns too many responsibilities or
     reaches into too many domains → split along bounded
     contexts, with the original kept only as the API surface
     facing the outside.
   - **Leaky boundaries.** Cross-context `reads` / `writes`
     directly on another context's database → introduce a `port`
     + `adapter` pair, or replace with `publishes` / `subscribes`
     events.
   - **Missing hexagonal structure** at external boundaries.
     Direct `http_call` to Stripe / OpenAI / payment processor →
     introduce a `port` (the abstract contract) and an `adapter`
     (the concrete impl), with `implements` between them.
   - **Cyclic dependencies** between modules — should be inverted
     (events) or broken (extract shared kernel).
   - **Anaemic queues.** Two services connected by `http_call`
     for what's clearly an async fire-and-forget → introduce a
     `queue` or `topic` and rewire to `publishes` / `subscribes`.

   Aim for 3–8 changes — enough to be meaningful, few enough that
   the user can reason about each. If you'd need more, propose
   the highest-impact subset and tell the user the rest is round
   two.

4. **Author + stage in one step.** Pipe the full proposed
   end-state directly into `npx archik suggest set -` via a
   heredoc — no temp files, no `/tmp/` paths:

   ```bash
   npx archik suggest set --note "evolve: <one-line summary>" - <<'YAML'
   version: "1.0"
   name: My Architecture
   nodes:
     # full proposed end-state — every node, not just the delta
   edges:
     # ...
   YAML
   ```

   Constraints when authoring the YAML:
   - Preserve every existing node id you keep — only add or remove
     ids, never rename. Renames break diff and require the user to
     manually re-link references in code.
   - Don't drop `description`, `responsibilities`, or `notes`
     fields the user authored. Carry them over verbatim.
   - Every change should be motivated by step 3, not by aesthetics.

   If `suggest set` reports validation errors, re-run with the
   corrected YAML. Never patch the sidecar directly.

5. **Open the discussion.** Print, in this order:

   a. The canvas URL with: *"📝 Evolved diagram staged — open
      <URL> and toggle Review to see green / red / amber overlays."*
   b. A numbered, plain-English summary of the proposed changes,
      grouped by motivation (e.g. *"1. Extract a `payments`
      bounded context from `orders`. Why: payment logic was leaking
      into order placement…"*). Keep each item to 2–3 sentences.
   c. An explicit invitation: *"Tell me what you'd like to keep,
      drop, or rework before you accept. I can re-stage with
      changes — `/archik:accept` is whenever you're ready."*

   **Do NOT auto-accept.** Even if the user said "evolve and apply"
   in shorthand, evolve always stops at the staged sidecar so the
   diff is reviewable.

## Iterating

If the user pushes back on specific items ("keep the orders
service whole; only fix the Stripe integration"), re-run
`npx archik suggest set -` with the revised YAML — it overwrites
the previous sidecar. Acknowledge what you changed
since the last round so the user doesn't have to re-read the
whole diff.

## Notes

- Evolve is bounded-context-aware but doesn't blindly apply DDD.
  If the project is genuinely small and a single service is the
  right answer, say so and stage no changes — better than
  inventing structure for its own sake.
- If you'd need to look at code (not just the diagram) to make a
  responsible recommendation, say so up front and ask for
  permission to read specific files. Don't silently expand scope.
