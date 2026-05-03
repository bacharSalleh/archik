---
name: archik
description: Use whenever .archik/main.archik.yaml or architecture.archik.yaml exists in the project, or the user asks about architecture, services, dependencies, or data flow. The YAML is the shared map between user and Claude. Interact with it ONLY through the `npx archik` CLI — `q` for queries, `schema` for shape, `suggest set` for proposals, `validate` after every change. Never read, write, or edit archik files manually.
---

# Archik — the project's shared map

The archik file (under `.archik/` or as legacy `architecture.archik.yaml`) is **the user's source of truth for what the system looks like**. The browser canvas is a stateless projection of this file — when the user says "the orders service" or "the events queue", they mean the entity with that `id` in the YAML.

You don't need to read or memorise the YAML's shape. The CLI is your interface to everything: structure, schema, proposals, lifecycle.

## Hard rule: the CLI is the only interface to archik files

You MUST NOT use `Read`, `Write`, or `Edit` against any file under `.archik/`, any `*.archik.yaml`, any sidecar, or `architecture.archik.yaml`. The `npx archik` CLI is the contract — it owns reads, writes, validation, schema, lifecycle.

| Need                         | Use                                       |
| ---------------------------- | ----------------------------------------- |
| Schema (kinds, fields, …)    | `npx archik schema`                       |
| Inspect structure            | `npx archik q ...`                        |
| Validate                     | `npx archik validate <path>`              |
| Propose a change             | `npx archik suggest set` (stdin heredoc)  |
| Apply / discard a suggestion | `npx archik suggest accept | reject`      |
| Render or diff               | `npx archik render` / `npx archik diff`   |
| Help on any command          | `npx archik <cmd> --help`                 |

`.archik/main.archik.yaml` is the user's source of truth — only `npx archik suggest accept` may mutate it. Sidecars (`*.archik.suggested.yaml`) are owned by the CLI too — only `suggest set` writes them, only `accept` / `reject` consumes them.

If `npx archik` is unreachable (offline, sandboxed, missing), STOP and tell the user. Do NOT fall back to reading or editing YAML by hand.

## File modes — two modes, picked by filename

| Suffix                             | Mode         | When to use                                                                                          | sourcePath rule                                                                 |
| ---------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `*.archik.yaml`                    | **normal**   | The canonical architecture of code that exists.                                                      | Required for code-bearing kinds; **must exist on disk** (validated).            |
| `*.archik.suggested.yaml`          | **suggested**| A pending change to a normal file. Owned by `suggest set`. Becomes normal on `suggest accept`.       | Same rules as normal — it'll become normal when accepted.                       |

There is **no separate "discussion" file mode**. Greenfield / exploratory work — a node you want in the diagram before its code exists — is expressed via `status: proposed` on the affected nodes (and edges); see the next section. The diagram stays the canonical architecture.

**Code-bearing kinds** (those that must declare `sourcePath`): `service`, `function`, `worker`, `module`, `page`, `component`, `store`, `hook`. Other kinds (`external`, `cloud`, `prompt`, `llm`, `route`, `interface`, `adapter`, `port`, `database`, `cache`, `queue`, `topic`, `stream`, `gateway`, `cdn`, `agent`, `frontend`, `vectordb`, `storage`, `auth`, `observability`, `tool`, `custom`) are exempt.

If `suggest set` rejects your draft with a `sourcePath` error, the right answer is usually one of: (a) fix the path to point at real code, (b) use a non-code-bearing kind (e.g., `external` for a third-party service), or (c) mark the node `status: proposed` if it's a planned-but-not-built component (see "Lifecycle status" below).

## Required `description` — every node, every time

`description` is **required** on every node — empty strings rejected, missing values rejected. The description must explain **what the node does** — its responsibility, the work it performs, why it exists — not just restate its `kind` or `name`.

> Bad: *"A service."*  *"The orders module."*  *"Frontend."*
> Good: *"Owns order placement and status — accepts cart payloads, validates inventory, writes to `orders` and emits `order.placed` to the stream."*

Two reasons it's enforced:
1. The diagram is the shared map between you and the user. A node without a description is a black box neither of you can reason about.
2. When the user asks *"what does X do?"*, you should be answering from `npx archik q describe X`, not from intuition. That answer is only useful if the description was written with care.

## Lifecycle status — `proposed`, `active`, `deprecated` (nodes AND edges)

Both **nodes and edges** carry an optional `status` field — same enum, same defaults, same visual treatment. Use it to keep the canonical diagram honest about what's built vs. what's planned vs. what's going away.

| status                    | When                                                                                          | sourcePath rule (nodes only)                               | Visual                                |
| ------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------- |
| absent / `active`         | Built and live (default).                                                                     | Required for code-bearing kinds, must exist on disk.       | Standard solid stroke.                |
| `proposed`                | Planned for the next iteration — belongs in the canonical map but isn't built yet.            | Optional. If you supply one, it must still exist on disk.  | Dashed indigo border, reduced opacity. |
| `deprecated`              | Being phased out; reads/writes shouldn't depend on it going forward.                          | Optional. Same on-disk rule as `proposed` if you set one.  | Dashed amber border + strikethrough on the name. |

For edges, `status: proposed` expresses "this dependency is planned" (e.g. *"orders-api will start subscribing to `payments.completed` next sprint"* — set the new edge's `status: proposed` until the code lands). `archik drift` and the validator both respect the lifecycle so proposed nodes don't trigger missing-source warnings before they're built.

## Other validation rules worth pre-empting

- **No duplicate edges by `(from, to, relationship)`**. Two edges between the same pair with the same relationship render as overlapping strokes and bloat the diagram silently. The validator rejects the second occurrence and points at the first by id. If you genuinely need to express two different concerns between the same pair (e.g. `service → db` for both `reads` and `writes`), use distinct relationships.
- **Parent / child `sourcePath` containment**. When a parent and a child both declare `sourcePath` and the parent's path is a directory, the child's `sourcePath` MUST be inside the parent's. `module: src/orders` → `function: src/orders/api.ts` is fine; `module: src/orders` → `function: src/payments/api.ts` is rejected because the diagram's containment claim contradicts the source tree. The check skips parents whose `sourcePath` is a single file (a file can't contain anything on disk) and parents without `sourcePath` at all.

## Slash commands (user-facing entry points)

| Command                     | Purpose                                       |
| --------------------------- | --------------------------------------------- |
| `/archik:spawn`             | Bootstrap a diagram from the source tree      |
| `/archik:evolve`            | Propose a cleaner bounded-context refactor    |
| `/archik:suggest <…>`       | Propose changes from a feature description    |
| `/archik:describe <id>`     | Explain a node and its connections            |
| `/archik:accept`            | Apply the pending suggestion                  |
| `/archik:reject`            | Discard the pending suggestion                |
| `/archik:dev`               | Open the live canvas                          |

Slash commands are typed **by the user**, not by you. You always run `npx archik` directly. When a workflow internally needs `suggest accept` (e.g. spawn's sub-file step — the parent draft references sub-files via `archikFile:` and `suggest set` validates target-on-disk), narrate the rationale so the user can tell you are not bypassing their `/archik:accept` review on the main draft. The main draft is always left as a sidecar.

When a user types `/archik:suggest`, `/archik:spawn`, or `/archik:evolve`, treat it as direct authorisation to run the sidecar workflow now — skip "want me to update the YAML?". Each command's body file under `.claude/commands/archik/` has the full protocol; follow it.

Distinction:
- **`spawn`** = descriptive (mirror the source tree as it is)
- **`evolve`** = prescriptive (propose a cleaner shape, then discuss before accepting)
- **`suggest`** = targeted (apply one feature-sized change from a description)

## The engineering loop (how archik fits into delivering work)

Archik is the front of a five-phase loop that turns intent into
working, reviewed, validated code. **Every structural change runs the
loop.** Don't skip phases; don't silently retry on rejection; don't
paper over a wrong design mid-build — go back.

```
  ┌────────────┐  q stats / list / source tree.
  │  DISCOVER  │  Read before write. Map intent onto what already
  └─────┬──────┘  exists.
        │
  ┌─────▼──────┐  Frame intent in one line + 1–3 sharp clarifying Qs.
  │   DESIGN   │  Stage sidecar (`suggest set`) with rationale:
  │            │  bounded contexts, sync vs async, composition,
  └─────┬──────┘  alternatives rejected.       ◄── reject + reason ──┐
        │                                                            │
  ┌─────▼──────┐  Canvas diff: accept | reject (why?) | revise.      │
  │   DECIDE   │ ───────────────────────────────────────────────────►┤
  └─────┬──────┘                                                     │
        │ accept                                                     │
  ┌─────▼──────┐  Plan → Implement → Self-review.                    │
  │   BUILD    │  Small reversible commits, one delta each.          │
  │            │  Tests-first when behaviour is clear.               │
  │            │  If implementation invalidates the design ─────────►┘
  └─────┬──────┘  loop back to DESIGN — don't paper over.
        │
  ┌─────▼──────┐  npx archik validate; tests; drift; regen SVG.
  │   VERIFY   │  Evidence before assertions. Propose next iteration —
  └────────────┘  don't end on "done".
```

| Phase    | Driver       | Output / tool                                              |
| -------- | ------------ | ---------------------------------------------------------- |
| Discover | Claude       | `npx archik q ...` + source-tree `ls`                      |
| Design   | Claude → User | sidecar via `suggest set`, after 1–3 clarifying Qs (HITL) |
| Decide   | User         | `/archik:accept` or `/archik:reject` (HITL gate)           |
| Build    | Claude → User | numbered plan (HITL approval), then small commits         |
| Verify   | Claude       | `npx archik validate` + tests + drift + SVG regen          |

**Two non-obvious feedback edges** (the things real loops have that flat
lists miss):

1. **Decide → Design on reject.** A rejection is information; ask one
   specific question (boundary? relationship? scope? naming?
   composition? lifecycle?), treat the answer as a hard constraint,
   re-stage. Never silently retry the same draft.
2. **Build → Design on invalidation.** If implementation reveals the
   accepted diagram is wrong (a missing port, a hidden dependency, a
   boundary that doesn't hold), STOP coding. Open a fresh
   `/archik:suggest` to fix the diagram first, then resume. Code that
   silently contradicts the diagram is drift before it's even merged.

### Design heuristics — apply these in the DESIGN phase

Before staging a sidecar, run the candidate through this checklist.
Each item is a yellow flag; flag them out loud in your rationale
rather than hiding them.

- **One reason to change.** Each new node has a single responsibility
  expressible in one sentence. If `description` rambles, decompose.
- **Bounded contexts.** Name the context this change belongs to. A
  change spanning two contexts is a yellow flag — usually means a
  missing third (orchestrator, port, gateway).
- **Async at context boundaries.** Default cross-context coupling to
  `publishes` / `subscribes` over a stream/queue. `http_call` across
  contexts is allowed but should be justified (sync-required RPC,
  query for read-side data).
- **Composition over sprawl.** Group related nodes under a `module`
  parent via `parentId`. Flat top-level lists past ~8 nodes are a
  smell.
- **Ports & adapters at the edge.** External integrations sit behind
  an `external` node, never inline inside a service. A port (interface)
  + adapter (concrete) pair is preferred when the integration could
  swap.
- **Public traffic → gateway/auth upstream.** Anything user-facing
  routes through a `gateway`/`auth` node, not directly to a service.
- **Failure modes.** Async producers imply DLQ/retry on the consumer;
  `http_call` implies timeout + circuit. Don't draw the happy path
  alone.
- **Lifecycle honesty.** Code-bearing node without code on disk →
  `status: proposed`. About to be removed → `status: deprecated`. The
  diagram should track reality, not aspiration.

### Optional sharpening — `superpowers:*` skills (if installed)

The loop is self-contained, but these skills sharpen specific phases
when the user has them. Check the available-skills list at session
start; never assume they exist.

| Phase   | Skill                                          |
| ------- | ---------------------------------------------- |
| Design  | `superpowers:brainstorming`                    |
| Build   | `superpowers:writing-plans`,                   |
|         | `superpowers:test-driven-development`,         |
|         | `superpowers:requesting-code-review`           |
| Verify  | `superpowers:verification-before-completion`   |

## Protocol — three rules

1. **Before** answering structural questions, query via `npx archik q ...`. Never `cat` or `Read` the YAML.
2. **Before** authoring a draft for `suggest set`, run `npx archik schema` once to lock in the exact field shape. The CLI is the schema; the prose below is the workflow.
3. **After** every `suggest set`, the CLI has already validated. If it exited non-zero, fix the YAML you piped and re-run — never edit the sidecar. After every `suggest accept`, propose follow-up steps (see "Follow-ups" below).

## Grounding (do this once per session, before structural work)

The archik diagram tells you *what* exists. The source tree tells you *where* it lives. Use the CLI for the first half:

```
npx archik q stats     # node + edge counts, kind histogram, file count
npx archik q list      # every node with kind, parent, file
npx archik q edges     # every edge with relationship and endpoints
```

Then `ls -F . src/ services/ packages/ apps/ 2>/dev/null` for the source tree. Build the mapping in your head; mismatches are where new code most often needs a YAML update.

When the user asks "where would I add X?", you should already have the answer because you ran the queries above.

**Every code-bearing node you propose for a normal/suggested file must declare a `sourcePath` that you have verified exists on disk** (e.g. `ls src/payments/worker.ts` before authoring `sourcePath: src/payments/worker.ts`). The validator rejects fabricated paths — and the rejection is non-negotiable, exactly so hallucinated nodes can't slip into the canonical architecture. If the source doesn't exist yet, mark the node `status: proposed` and omit `sourcePath` (or set one that points where the code WILL live, but it has to actually exist by the time you flip the status to active).

## Authoring drafts (sidecar workflow)

When work introduces, removes, or rewires components, you stage a proposal as a sidecar via the CLI. The user reviews on the canvas and accepts / rejects.

**Step 1 — get the schema.** Before authoring, run:

```
npx archik schema
```

That prints every required field, every type ("array of string" vs "string"), every kind, every relationship, every constraint. Use it. **Do not write archik YAML from intuition.**

**Step 2 — pipe the draft straight into `suggest set` via heredoc.** No temp files, no `/tmp/` paths:

```bash
npx archik suggest set --note "<one-liner>" - <<'YAML'
version: "1.0"
name: My Architecture
nodes:
  # full proposed end-state — every node, not just the delta
edges:
  # full proposed end-state — every edge, not just the delta
YAML
```

The CLI parses, schema-validates, checks cross-file references, stamps `metadata.suggestion`, and atomically writes the sidecar. If it exits non-zero, the error includes a hint pointing at the field that's wrong — fix the heredoc and re-run.

**Step 3 — surface the canvas URL** so the user can review the diff overlay (added/removed/changed get green/red/amber frames). Or terminal: `npx archik suggest show | accept | reject`.

### Sub-architectures (a brand-new `archikFile`)

If a node needs its own diagram, you'll author both the parent change AND the new sub-file. Order matters because the parent's `archikFile:` pointer is validated against on-disk existence:

```bash
# 1. Stage + accept the new sub-file (orphan, parent doesn't exist yet)
npx archik suggest set --main .archik/<id>.archik.yaml \
                       --allow-orphan \
                       --note "spawn: <id> internals" - <<'YAML'
...
YAML
npx archik suggest accept .archik/<id>.archik.yaml

# 2. Now the file is real on disk; stage the parent change
npx archik suggest set --note "..." - <<'YAML'
... (with archikFile: .archik/<id>.archik.yaml on the relevant node)
YAML
```

**Rules:**
- Write the *full proposed document*, not a patch. The diff is computed by archik between main and sidecar.
- Don't `Write`/`Edit` archik files. The CLI owns `.archik/`.
- If a sidecar already exists, `suggest set` overwrites it. Mention to the user that you replaced their previous pending suggestion.
- Renaming an `id` is forbidden — remove the old node and add a new one. Renames break diff and require manual re-link in code.
- Don't drop user-authored `description`, `responsibilities`, or `notes` fields when carrying a node forward.

## When to consult the YAML (via `q`)

- "What does X do?" / "What's its responsibility?" → `npx archik q describe X`
- "What writes to / reads from / publishes to Y?" → `npx archik q dependents Y --rel writes` etc.
- "What depends on Z?" → `npx archik q dependents Z`
- "What would break if I remove Z?" → `npx archik q impact Z`
- "What services exist?" / "Is there a queue / cache / gateway already?" → `npx archik q list --kind <kind>`

If `q` returns empty for an id, the YAML doesn't have it — say so and offer to add it via `/archik:suggest`.

## When to propose updates

Proactively suggest a sidecar (don't silently apply) when work changes shape:

- New service, function, worker, frontend, queue, DB, etc.
- New dependency between existing components.
- New external API integration.
- Removing or renaming a component.
- Splitting one component into several, or merging several into one.

Frame it as: *"This adds a `payments-worker` reading from the `order-events` queue. Want me to stage that as an archik suggestion?"* — wait for the user to confirm or for them to type `/archik:suggest`.

## When to defer

- Pure refactors that don't change the component graph → leave the diagram alone.
- Local file moves / renames → leave it alone.
- Bug fixes inside an existing node → leave it alone.

The diagram tracks **shape**, not implementation detail.

## Follow-ups (do this after every accept / reject)

After a suggestion is accepted, the diagram has changed. Don't just stop — propose what's natural next. Pick whichever fits:

1. **Implement the change.** If the suggestion added a new node (e.g. a worker, a queue), the code for it doesn't exist yet. Offer to scaffold it: *"The diagram now shows `payments-worker` subscribing to `order-events`. Want me to scaffold `src/workers/payments/` with a stub consumer?"*
2. **Improve.** If the change was small but exposed bigger architectural smells (a god service, a missing port/adapter pair, a leaky boundary), suggest `/archik:evolve` to clean it up: *"Worth running `/archik:evolve` on the `orders` module? It's now wired to four downstream services and might want a clearer port."*
3. **Diff vs reality.** Offer to spot-check the source tree against the new diagram: *"Should I scan `src/` to confirm the diagram still matches the code?"*
4. **Render.** If the project commits a rendered SVG (`docs/architecture.svg`), regenerate it: `npx archik render --out docs/architecture.svg`. Offer to do this if such a file exists.

After a rejection, **never go silent and never silently retry the same draft**. Ask a question pinned to one of these axes — the answer becomes a constraint when you regenerate:

- **Boundary** — *"Did the wrong context own a node? e.g. should `payments-worker` live under `orders` or under `billing`?"*
- **Relationship** — *"Was a sync `http_call` wrong where you wanted `publishes`/`subscribes`?"*
- **Scope** — *"Too big? Want me to try a smaller delta that only touches the queue, not the worker?"*
- **Naming** — *"Was the id/name unclear? What would you call it?"*
- **Composition** — *"Should this be one node, or split into a port + adapter pair?"*

Then loop back to step 2 (Clarify) of the engineering loop with the rejection reason as a hard constraint on the next draft.

The goal: every accepted change ends with the user knowing what's next, not "ok, accepted". Every rejection ends with one specific question, not silence.

## Sequence diagrams

Sequence diagrams live alongside architecture files in `.archik/` as `*.archik.seq.yaml` files. Each one documents a specific runtime flow (e.g. a request path, an event chain, an auth handshake) at the call level, using a subset of UML.

### How they connect to architecture nodes

A node in the architecture YAML declares which flows it participates in via the `seqFiles` field:

```yaml
- id: api-gateway
  kind: gateway
  label: API Gateway
  description: ...
  seqFiles:
    - .archik/login-flow.archik.seq.yaml
    - .archik/checkout-flow.archik.seq.yaml
```

`seqFiles` is a **non-empty array of relative paths** (at least one entry required) from the project root. The validator checks each path exists on disk. Nodes without `seqFiles` are unaffected.

**UI effect:** nodes with `seqFiles` get clickable diagram links in the node inspector. The toolbar shows a "glow" button that highlights all nodes with seq diagrams so they're easy to spot on large canvases.

### Authoring rule — seq files are direct-write (not `suggest set`)

`suggest set` is for architecture files only. Seq files have **no sidecar workflow** — create or edit them directly with `Write` / `Edit`. Then validate:

```bash
npx archik validate .archik/main.archik.yaml   # validates seq files referenced by seqFiles fields too
```

### Seq YAML schema

```yaml
version: "1.0"          # required, literal
name: "Login flow"      # required, non-empty
description: "..."      # optional

participants:            # required, at least one
  - id: browser         # participant ref id (used in steps)
    nodeId: frontend    # architecture node id this participant maps to
                        # the node's kind (gateway, service, database…) is
                        # automatically applied to the participant header icon/color
    label: Browser      # optional display label (defaults to nodeId)
    status: proposed    # optional — proposed | active | deprecated (header/lifeline dim + dashed border)

steps:                  # ordered list of messages, notes, groups
  # --- message ---
  - type: message
    id: m1
    from: browser       # participant id
    to: api             # participant id
    label: POST /login
    arrow: sync         # sync | async | return | create | destroy
    activate: true      # optional — draws activation box on receiver
    status: proposed    # optional — proposed | active | deprecated

  # --- note ---
  - type: note
    id: n1
    position: over      # over | left_of | right_of
    participants: [api] # list of participant ids the note spans
    text: "JWT issued here"
    status: proposed    # optional

  # --- group (alt / opt / loop / par / break / ref) ---
  - type: group
    id: g1
    kind: alt
    condition: "[authenticated]"   # optional — shown in group header
    branches:
      - label: "[success]"         # optional branch label
        steps:
          - type: message
            id: m2
            from: api
            to: browser
            label: "200 OK"
            arrow: return
      - label: "[failure]"
        steps:
          - type: message
            id: m3
            from: api
            to: browser
            label: "401 Unauthorized"
            arrow: return
    status: proposed               # optional

  # --- ref group (drill-down to another seq file) ---
  - type: group
    id: g2
    kind: ref
    label: "checkout flow"         # display label inside the frame
    seqFile: .archik/checkout-flow.archik.seq.yaml
                                   # relative path to the linked seq file
                                   # makes the frame clickable in the UI →
                                   # navigates to that diagram
    branches: []                   # branches must be present (can be empty for ref)
```

**Arrow types:**
| arrow | meaning |
|-------|---------|
| `sync` | synchronous call (solid line, filled arrowhead) |
| `async` | fire-and-forget (solid line, open arrowhead) |
| `return` | return value (dashed line, open arrowhead) |
| `create` | object creation (dashed line, filled arrowhead + `«create»` label prefix) |
| `destroy` | object destruction (solid line, × marker at target) |

**Group kinds:** `alt` (conditional), `opt` (optional), `loop`, `par` (parallel), `break`, `ref` (reference)

### Linking a new seq file (full workflow)

```bash
# 1. Write the seq file directly
# (use Write tool — no suggest set for seq files)

# 2. Validate the seq file is well-formed
npx archik validate .archik/main.archik.yaml

# 3. Add seqFiles to the relevant architecture node via suggest set
npx archik suggest set --note "link login-flow seq diagram to api-gateway" - <<'YAML'
version: "1.0"
name: My Architecture
nodes:
  - id: api-gateway
    ...
    seqFiles:
      - .archik/login-flow.archik.seq.yaml
  ... (all other nodes)
edges:
  ... (all edges)
YAML

# 4. Validate again — now checks the seqFiles path exists
npx archik validate .archik/main.archik.yaml

# 5. User accepts on canvas → node gets seq diagram link in inspector
```

### What the validator checks for seq diagrams

- All seq files referenced in `seqFiles` exist on disk
- Each seq file parses as valid YAML
- Each seq file matches the seq schema (version, participants, steps structure)
- Participant `nodeId` fields reference real node ids from the architecture
- No duplicate step ids within a seq file

### CLI render

```bash
npx archik render --seq .archik/login-flow.archik.seq.yaml --out login-flow.svg
# optionally: --theme dark|light (default: dark)
```

Renders a headless SVG of the sequence diagram. Useful for CI or docs. Participant icons/colors are automatically resolved from the architecture node kinds when a root arch doc is present in the same project root.

## Verification workflow

After every `suggest set` or `suggest accept`:

1. `suggest set` already validated schema + cross-file existence. If errors fired, the message includes a hint — fix the heredoc and re-run. Don't reach for `Write`/`Edit` on the sidecar.
2. If `archik dev` is running, the file watcher broadcasts the change to the canvas automatically. Surface the URL so the user can click through.
3. If `docs/architecture.svg` is committed, regenerate it (see Follow-ups).

## CLI reference (run `<cmd> --help` for full surface)

The CLI ships as the `archik` npm package; default to `npx archik` (works in fresh repos, no global install needed).

```
npx archik schema                       # the document shape (always start here when authoring)
                  --json                #   structured shape for piping into jq
                  --seq                 #   seq diagram schema instead of arch schema

npx archik q describe <id> | deps <id> | dependents <id>
                  list | edges | impact <id> | stats
                  sequences [--node <id>]   # list seq diagrams; --node filters to flows involving a node
                  --json                #   stable machine-readable shape

npx archik validate <path> [--json]     # schema + cross-file check (CI-friendly)
npx archik render --out diagram.svg --theme light|dark
              render --seq <path> --out seq.svg --theme light|dark   # render a seq diagram to SVG
npx archik diff a.yaml b.yaml [--out diff.svg] [--json]

npx archik suggest show [--json]
              suggest set <draft|->     # validate + stage a sidecar
                  --note '<text>'       # set metadata.suggestion.note
                  --main <path>         # override main file detection
                  --allow-orphan        # permit a sidecar with no main on disk
                  --json                # structured output
              suggest accept | reject

npx archik dev | start | stop | status  # canvas server lifecycle
npx archik watch                        # re-render to SVG on save
npx archik init                         # scaffold + install skill + slash commands
npx archik skill | commands             # refresh the skill / slash commands
```

Per-command help: `npx archik <cmd> --help`.

## Things to avoid

- Don't `cat`, `Read`, `Write`, or `Edit` archik files.
- Don't author drafts from memory; run `npx archik schema` first.
- Don't add coordinates (`x`, `y`, `width`, `height`, `viewport`) — layout is computed by ELK on every render. The schema rejects them.
- Don't add empty `notes` / `responsibilities` / `interfaces` lists — either include real entries or omit the field.
- Don't blow away user-authored fields when carrying a node forward.
- Don't bulk-restructure as a side effect of a small edit. Make the minimal change that captures what changed.
