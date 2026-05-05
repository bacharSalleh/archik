---
description: Propose a diagram change
argument-hint: <feature description>
---

# /archik:suggest — propose architecture changes

The user wants you to capture the structural impact of a feature in
the archik diagram. The user-facing description is:

**$ARGUMENTS**

This slash command IS the user's confirmation that they want a
sidecar suggestion. Skip the "want me to update the YAML?" question
and produce one now.

## CLI-only — do not touch archik files directly

You MUST interact with archik exclusively through the `npx archik`
CLI. Do NOT use Read, Write, or Edit on any file under `.archik/`,
on `architecture.archik.yaml`, or on any sidecar. The CLI is the
sanctioned interface; everything else is a manual edit and breaks
the contract with the user.

## This is the DISCOVER → DESIGN → DECIDE handoff of the engineering loop

The skill defines a 5-phase loop: **Discover → Design → Decide → Build
→ Verify**. This command covers Discover (grounding) and Design
(staging the sidecar with rationale), then hands off to the user's
review and the explicit Decide gate (`/archik:accept` or
`/archik:reject`). Don't skip clarification just because a slash
command was typed — clarification is what makes the draft good. Don't
start Build phase here; that's gated on accept.

## Steps

0. **Frame + clarify (entering DESIGN).** Before any CLI call, restate
   the user's intent in one sentence and list 1–3 sharp clarifying
   questions if any of these are ambiguous in `$ARGUMENTS`:
   - **Actor + use case** — which actor initiates this? Does an
     existing use case cover it, or is this a new user-visible
     behaviour? (Check `npx archik q actors` and `q usecases` in
     step 2 before asking if the answer isn't obvious from the brief.)
   - **Boundary** — which existing context owns this, or is it a new
     one? (data ownership = bounded context)
   - **Sync vs async** — request/response (`http_call`) or
     event-driven (`publishes`/`subscribes` over a stream)?
   - **Composition** — one node or split (e.g. port + adapter, gateway
     + service)?
   - **External integrations** — what third-party touches this?
   - **Lifecycle** — built now, or `status: proposed` for a planned
     iteration?

   Skip questions that `$ARGUMENTS` already answers. If the change is
   trivially small (one node, one edge, no boundary impact), skip the
   clarify pass entirely and go straight to step 1. **Use judgment;
   don't ask questions for the sake of asking.** When in doubt, ask
   the user "you decide?" so they can defer back if they want.

   **Before the structural sidecar, check if the feature needs
   requirements artifacts first:**
   - New human-facing flow or actor? Create/update
     `*.archik.actors.yaml` (direct-write) before staging the sidecar.
   - New user-visible behaviour? Author a `*.archik.uc.yaml` under
     `.archik/usecases/` (direct-write) with the flow and at least one
     slice before staging the sidecar. The structural model references
     what the use case requires.

1. **Make sure the canvas is running** so the user can review:
   ```
   npx archik status
   ```
   If nothing is running for this project, start it detached:
   ```
   npx archik start
   ```
   Note the URL it prints — you'll surface it at the end.

2. **Ground yourself in the current models** using the query CLI
   (do not `cat` the YAML):
   ```
   npx archik q stats
   npx archik q list
   ```
   If `$ARGUMENTS` mentions a specific node by name, also run
   `npx archik q describe <id>` for it.

   If the change is **non-trivial** (new actor, new user-visible
   behaviour, boundary impact, more than one node affected) also
   ground in the requirements model:
   ```
   npx archik q actors
   npx archik q usecases
   ```
   If any use case looks related, run
   `npx archik q describe-usecase <id>` to see its slices and
   check whether the proposed change extends, modifies, or
   introduces a UC — that determines whether you need to update
   a `*.archik.uc.yaml` before staging the structural sidecar.

   If step 0 already determined the change is trivially small
   (one node, one edge, no boundary or UC impact), skip the
   actor/UC queries and go straight to step 3.

3. **Lock in the schema.** Run this before drafting any YAML —
   the prose in this file describes the workflow, not the field
   shapes. The CLI is the schema:
   ```
   npx archik schema
   ```
   Pay attention to which fields are arrays (`notes`,
   `responsibilities`, `interfaces`) and which are required
   strings (every edge needs an `id`). Authoring from intuition
   produces predictable validation errors.

4. **Author + stage in one step.** Pipe the draft straight into
   `npx archik suggest set -` via a heredoc — no temp file, no
   `/tmp/` paths. The CLI validates the schema, checks cross-file
   references, stamps `metadata.suggestion`, and atomically writes
   `.archik/main.archik.suggested.yaml`.

   **Every new code-bearing node** (`service`, `function`, `worker`,
   `module`, `page`, `component`, `store`, `hook`) must declare a
   `sourcePath:` that you have verified exists on disk. The
   validator rejects fabricated paths. If the source doesn't
   exist yet (you're proposing a not-yet-built component), mark
   the node `status: proposed` and omit `sourcePath` — the
   validator exempts proposed nodes from the requirement and the
   canvas renders them with a dashed indigo border so the user
   sees they're planned.

   **Every node must also declare a non-empty `description`** that
   explains what the node DOES (its responsibility / behaviour),
   not just its kind or name. Empty / missing descriptions are
   rejected by the validator.

   **For nodes that participate in a use case flow**, add a
   `stereotype` field to classify their role in the ECB model:
   - `stereotype: boundary` — accepts requests from actors / external
     systems (adapters, gateways, API handlers)
   - `stereotype: control` — orchestrates the use case logic (services,
     use-case handlers, orchestrators)
   - `stereotype: entity` — stores or represents domain data (repos,
     domain models, DB-backed modules)

   The validator enforces ECB transition rules on seq diagrams that
   carry a `realizes` block — tag the nodes now so the rules can fire.

   ```bash
   npx archik suggest set --note "$ARGUMENTS" - <<'YAML'
   version: "1.0"
   name: My Architecture
   nodes:
     # full proposed end-state — every node, not just the delta
   edges:
     # full proposed end-state — every edge, not just the delta
   YAML
   ```

   If the command exits non-zero, re-run with the corrected YAML.
   Never write a draft file under `.archik/` and never edit the
   sidecar directly.

5. **Narrate the design rationale** in 2–4 short bullets before
   handing off to review. The user needs to see *why* this shape, not
   just *what* it is. Cover:
   - Which **bounded context(s)** the change touches and why those
     boundaries.
   - The **separation of concerns** — what each new node owns and why
     it's its own node (not folded into an existing one).
   - **Async vs sync** choice and the reason (cross-context coupling
     should default to async).
   - Any **alternative you rejected** and the trade-off.

   Keep it tight — bullets, not paragraphs. The diagram does the rest.

6. **Hand off to the DECIDE gate.** Surface the canvas URL plus the
   terminal options, then state the gate clearly:
   - "📝 Suggestion ready — open the canvas at <URL> for the diff."
   - "Terminal: `npx archik suggest show` / `accept` / `reject`."
   - "**Accept** to enter BUILD (plan → implement → self-review), or
     **reject** and tell me what didn't fit (boundary? relationship?
     scope? naming? composition? lifecycle?) so I can revise."

   Do NOT pre-emptively start implementing. Wait for `/archik:accept`.

## Notes

- If a sidecar already exists, `suggest set` overwrites it. Mention
  to the user that you replaced their previous pending suggestion.
- If `npx archik` is unreachable (offline, sandboxed), STOP and tell
  the user. Do not fall back to writing YAML by hand.
