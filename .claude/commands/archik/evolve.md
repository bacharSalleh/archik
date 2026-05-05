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

   Also check the Jacobson-chain artifacts so you can surface
   ECB and coverage smells alongside structural ones:
   ```
   npx archik q actors
   npx archik q usecases
   npx archik trace --json
   ```
   (These are non-fatal if no UC/actor files exist — note that
   and skip the UC smells below; focus on structural smells only.)

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
   - **Missing ECB stereotypes.** Only applies when actor/UC files
     exist (`npx archik q usecases` returns results). Nodes that
     appear in active UC slices (visible in `archik trace` output),
     or that have user-facing relationships (`http_call` from a
     gateway, `writes`/`reads` to a domain DB) but no `stereotype`
     field → classify each as `boundary`, `control`, or `entity`.
     This is a prerequisite for ECB validation on seq diagrams.
     Evolve may **add** a stereotype to nodes spawn left blank, but
     only when this smell is triggered. Never invent stereotypes on
     a pure structural diagram with no UC files.
   - **UC coverage gaps.** Only applies when UC files exist and
     `archik trace --json` returns rows. Active slices that are
     `partial` (tests exist but no seq realization) usually signal
     a missing seq diagram or a missing port/adapter in the
     structural model. Active slices that are `none` (no tests, no
     realization) signal untested behaviour — propose a test
     scaffold or a seq diagram, and flag any architectural gap that
     makes the slice hard to realize (e.g. missing adapter for an
     external call). If trace output is empty or all slices are
     `full`, skip this smell.

   Aim for 3–8 changes — enough to be meaningful, few enough that
   the user can reason about each. If you'd need more, propose
   the highest-impact subset and tell the user the rest is round
   two.

4. **Lock in the schema before authoring.** Run this once so you
   draft against the actual shape, not from intuition:
   ```
   npx archik schema
   ```
   Note which fields are arrays vs strings; every edge needs an
   `id`. Validation errors on the first attempt are almost always
   one of these two patterns.

5. **Author + stage in one step.** Pipe the full proposed
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
   - Don't drop `description`, `responsibilities`, `notes`,
     `sourcePath`, or `stereotype` fields the user authored. Carry
     them over verbatim.
   - Every new code-bearing node (`service`, `function`, `worker`,
     `module`, `page`, `component`, `store`, `hook`) needs a
     `sourcePath:` that exists on disk — the validator rejects
     fabricated paths. If the refactor proposes a not-yet-built
     module (e.g. extracting a `payments` context that doesn't have
     a directory yet), mark the node `status: proposed` and omit
     `sourcePath` — the validator exempts proposed nodes from the
     requirement. The canvas renders proposed nodes with a dashed
     indigo border so the user sees they're planned. Edges into /
     out of a proposed node should also carry `status: proposed`
     until the code lands.
   - Every node MUST have a non-empty `description` explaining
     what it does. Don't introduce a node without one.
   - When adding a `stereotype` to address the ECB smell, use only
     `boundary`, `control`, or `entity`. Don't add `stereotype` to
     purely infra nodes (`database`, `queue`, `external`, `cloud`).
   - Every change should be motivated by step 3, not by aesthetics.

   If `suggest set` reports validation errors, re-run with the
   corrected YAML. Never patch the sidecar directly.

6. **Open the discussion.** Print, in this order:

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
