---
name: archik
description: Use whenever .archik/main.archik.yaml or architecture.archik.yaml exists in the project, or the user asks about architecture, services, dependencies, or data flow. The YAML is the shared map between user and Claude. Interact with it ONLY through the `npx archik` CLI — `q` for queries, `schema` for shape, `suggest set` for proposals, `validate` after every change. Never read, write, or edit archik files manually.
---

# Archik — the project's shared map

## Mental model (read this first)

- **The YAML is the source of truth.** `.archik/main.archik.yaml` (and any `*.archik.yaml` sub-files) describe the system the user is building. The browser canvas is just a stateless projection of that file.
- **The CLI is your only interface to it.** You never read, write, or edit archik files directly. Every read goes through `npx archik q ...`; every write goes through `npx archik suggest set` → user accepts via `/archik:accept`.
- **Two command surfaces:** the user types `/archik:*` slash commands; you run `npx archik ...` directly. They're not interchangeable — see the tables below.

## Command surfaces

### The user types these (slash commands)

These are the user's entry points. They're triggered by the user typing `/archik:<name>` in chat. When you see one, it's the user's authorisation to run the corresponding workflow now — skip the "want me to update the YAML?" question.

| Slash command           | What the user is asking for                                       |
| ----------------------- | ----------------------------------------------------------------- |
| `/archik:spawn`         | Bootstrap a diagram by mirroring the source tree (descriptive)    |
| `/archik:evolve`        | Propose a cleaner bounded-context refactor (prescriptive)         |
| `/archik:suggest <…>`   | Apply one feature-sized change from a description (targeted)      |
| `/archik:describe <id>` | Explain a node and its connections                                |
| `/archik:dev`           | Open the live canvas                                              |
| `/archik:accept`        | Apply the pending sidecar suggestion                              |
| `/archik:reject`        | Discard the pending sidecar suggestion                            |

The full protocol for each lives at `.claude/commands/archik/<name>.md`. Follow it when invoked.

### You run these (`npx archik` CLI)

These are the verbs you reach for during the loop. Default to `npx archik` (no global install needed).

| Need                              | Command                                       |
| --------------------------------- | --------------------------------------------- |
| Get the document schema           | `npx archik schema`                           |
| Inspect the current diagram       | `npx archik q list \| edges \| stats`         |
| Look up one node                  | `npx archik q describe <id>`                  |
| Find dependencies / impact        | `npx archik q deps \| dependents \| impact <id>` |
| Validate a file                   | `npx archik validate <path>`                  |
| Stage a proposed change           | `npx archik suggest set --note '…' - <<'YAML' … YAML` |
| Show / accept / reject pending    | `npx archik suggest show \| accept \| reject` |
| Render an SVG                     | `npx archik render --out diagram.svg`         |
| Diff two files                    | `npx archik diff a.yaml b.yaml`               |
| Detect drift vs source tree       | `npx archik drift`                            |
| Open the live canvas (foreground) | `npx archik dev`                              |
| Open the canvas (detached)        | `npx archik start` / `stop` / `status`        |
| Per-command help                  | `npx archik <cmd> --help`                     |

## Hard rule: the CLI is the only interface to archik files

You MUST NOT use `Read`, `Write`, or `Edit` against any file under `.archik/`, any `*.archik.yaml`, any sidecar (`*.archik.suggested.yaml`), or `architecture.archik.yaml`. The CLI owns reads, writes, validation, schema, and lifecycle.

If `npx archik` is unreachable (offline, sandboxed, missing), STOP and tell the user. Do NOT fall back to reading or editing YAML by hand.

**Exception:** sequence diagrams (`*.archik.seq.yaml`) have **no sidecar workflow** — create or edit them directly with `Write` / `Edit`, then validate via `npx archik validate`. See "Sequence diagrams" below.

## The engineering loop (how archik fits into delivering work)

Every structural change runs the loop. Don't skip phases; don't silently retry on rejection; don't paper over a wrong design mid-build — go back.

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

| Phase    | Driver        | Tool you reach for                                  |
| -------- | ------------- | --------------------------------------------------- |
| Discover | Claude        | `npx archik q ...` + source-tree `ls`               |
| Design   | Claude → User | sidecar via `suggest set`, after 1–3 clarifying Qs  |
| Decide   | User          | `/archik:accept` or `/archik:reject` (HITL gate)    |
| Build    | Claude → User | numbered plan (HITL approval), then small commits   |
| Verify   | Claude        | `npx archik validate` + tests + `drift` + SVG regen |

**Two non-obvious feedback edges:**

1. **Decide → Design on reject.** A rejection is information; ask one specific question (boundary? relationship? scope? naming? composition? lifecycle?), treat the answer as a hard constraint, re-stage. Never silently retry the same draft.
2. **Build → Design on invalidation.** If implementation reveals the accepted diagram is wrong (a missing port, hidden dependency, boundary that doesn't hold), STOP coding. Open a fresh `/archik:suggest` to fix the diagram first, then resume.

## Worked examples

### 1. Answer a question about the architecture

User asks "what writes to the orders DB?":

```bash
npx archik q dependents orders-db --rel writes
```

Other common queries:

```bash
npx archik q describe orders-api           # node detail + edges
npx archik q deps orders-api               # what does this node depend on?
npx archik q impact payments-db            # what would break if this is removed?
npx archik q list --kind service           # all services
npx archik q list --kind queue             # all queues
npx archik q stats                         # node + edge counts, kind histogram
```

If `q` returns empty for an id, the YAML doesn't have it — say so and offer to add it via `/archik:suggest`.

### 2. Stage a sidecar suggestion (the standard write path)

When work introduces, removes, or rewires components, you propose a sidecar. The user reviews on the canvas and accepts/rejects.

```bash
# Step A — get the schema (always start here when authoring)
npx archik schema

# Step B — pipe the FULL proposed end-state (every node, every edge —
# not a delta) straight into `suggest set` via heredoc. No temp files.
npx archik suggest set --note "add payments worker" - <<'YAML'
version: "1.0"
name: My Architecture
nodes:
  - id: orders-api
    kind: service
    name: Orders API
    description: Owns order placement and status — accepts cart payloads, validates inventory, writes to orders, emits order.placed.
    sourcePath: services/orders/api
  - id: order-events
    kind: stream
    name: order-events
    description: Stream of domain events emitted by orders-api (placed, cancelled, fulfilled).
  - id: payments-worker
    kind: worker
    name: Payments worker
    description: Subscribes to order.placed, charges via Stripe, writes payment records.
    sourcePath: services/payments/worker
edges:
  - id: orders-emits
    from: orders-api
    to: order-events
    relationship: publishes
  - id: payments-subscribes
    from: payments-worker
    to: order-events
    relationship: subscribes
YAML
```

The CLI parses, schema-validates, checks cross-file references, stamps `metadata.suggestion`, and atomically writes the sidecar. If it exits non-zero, the error includes a hint pointing at the wrong field — fix the heredoc and re-run. **Never edit the sidecar by hand.**

```bash
# Step C — surface the canvas URL so the user can review the diff overlay
# (added/removed/changed get green/red/amber frames).
# Or terminal: `npx archik suggest show | accept | reject`.
```

### 3. Verify before declaring done

```bash
npx archik validate .archik/main.archik.yaml   # schema + cross-file checks
npx archik drift                                # diagram vs source tree
npx archik render --out docs/architecture.svg  # if the project commits an SVG
```

### 4. Sub-architecture (a brand-new `archikFile`)

If a node needs its own diagram, author both the parent change AND the new sub-file. **Order matters** — the parent's `archikFile:` pointer is validated against on-disk existence:

```bash
# 1. Stage + accept the new sub-file (orphan, parent doesn't exist yet)
npx archik suggest set --main .archik/payments.archik.yaml \
                       --allow-orphan \
                       --note "spawn: payments internals" - <<'YAML'
version: "1.0"
name: Payments internals
nodes: [ ... ]
edges: [ ... ]
YAML
npx archik suggest accept .archik/payments.archik.yaml

# 2. Now the file is real on disk; stage the parent change
npx archik suggest set --note "link payments sub-architecture" - <<'YAML'
version: "1.0"
name: My Architecture
nodes:
  - id: payments
    ...
    archikFile: .archik/payments.archik.yaml
  ... (every other node)
edges:
  ... (every edge)
YAML
```

When you auto-accept the sub-file, **narrate the rationale** so the user can tell you're not bypassing their `/archik:accept` review on the main draft. The main draft is always left as a sidecar.

### 5. Sequence diagrams (direct-write, no sidecar)

Sequence diagrams live in `.archik/` as `*.archik.seq.yaml` files and document a specific runtime flow at the call level. They are the **only** archik file mode you write directly.

```bash
# 1. Write the seq file directly with the Write tool
# 2. Validate (this also checks every seqFiles reference)
npx archik validate .archik/main.archik.yaml

# 3. Link it from an architecture node via `suggest set` (sidecar workflow)
npx archik suggest set --note "link login-flow seq diagram to api-gateway" - <<'YAML'
version: "1.0"
name: My Architecture
nodes:
  - id: api-gateway
    ...
    seqFiles:
      - .archik/login-flow.archik.seq.yaml
  ... (every other node)
edges: [ ... ]
YAML

# 4. Render to SVG (optional, useful for CI / docs)
npx archik render --seq .archik/login-flow.archik.seq.yaml --out login-flow.svg
```

`seqFiles` is a non-empty array of relative paths from project root. The validator checks each path exists.

The seq schema (UML subset) is documented at the bottom of this file under "Sequence diagram schema reference".

## File modes — two modes, picked by filename

| Suffix                      | Mode          | When to use                                                                         |
| --------------------------- | ------------- | ----------------------------------------------------------------------------------- |
| `*.archik.yaml`             | **normal**    | The canonical architecture of code that exists.                                     |
| `*.archik.suggested.yaml`   | **suggested** | A pending change to a normal file. Owned by `suggest set`. Becomes normal on accept. |
| `*.archik.seq.yaml`         | **sequence**  | A runtime flow diagram. Direct-write. No sidecar.                                   |

There is no separate "discussion" file mode. Greenfield / exploratory work is expressed via `status: proposed` on the affected nodes and edges (see Lifecycle below). The diagram stays canonical.

## Required fields and validation rules

These rules are enforced by the validator. Pre-empt them when authoring.

### Every node needs a `description`

Empty strings rejected, missing values rejected. Explain what the node **does** — its responsibility, the work it performs, why it exists — not just its `kind` or `name`.

> Bad: *"A service."*  *"The orders module."*
> Good: *"Owns order placement and status — accepts cart payloads, validates inventory, writes to `orders` and emits `order.placed` to the stream."*

### Code-bearing kinds need a `sourcePath`

These kinds MUST declare a `sourcePath` that exists on disk: `service`, `function`, `worker`, `module`, `page`, `component`, `store`, `hook`.

Other kinds are exempt: `external`, `cloud`, `prompt`, `llm`, `route`, `interface`, `adapter`, `port`, `database`, `cache`, `queue`, `topic`, `stream`, `gateway`, `cdn`, `agent`, `frontend`, `vectordb`, `storage`, `auth`, `observability`, `tool`, `custom`.

If `suggest set` rejects with a `sourcePath` error, you have three options:
1. Fix the path to point at real code (verify with `ls` first).
2. Use a non-code-bearing kind (e.g. `external` for a third-party service).
3. Mark the node `status: proposed` if it's planned-but-not-built (see Lifecycle).

**Never paste a path you haven't seen on disk.** The validator rejects fabricated paths so hallucinated nodes can't slip into the canonical architecture.

### Lifecycle status — `proposed`, `active`, `deprecated`

Both **nodes and edges** carry an optional `status`. Same enum, same defaults, same visual treatment.

| status              | When                                                                  | sourcePath rule (nodes)                              | Visual                                            |
| ------------------- | --------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| absent / `active`   | Built and live (default).                                             | Required for code-bearing kinds; must exist on disk. | Standard solid stroke.                            |
| `proposed`          | Planned for next iteration — belongs in the canonical map but isn't built yet. | Optional; if supplied, must exist on disk.   | Dashed indigo border, reduced opacity.            |
| `deprecated`        | Being phased out; new work shouldn't depend on it.                    | Optional; same on-disk rule as `proposed`.           | Dashed amber border + strikethrough on the name.  |

For edges, `status: proposed` expresses "this dependency is planned" (e.g. *"orders-api will start subscribing to `payments.completed` next sprint"*). `archik drift` and the validator both respect lifecycle so proposed nodes don't trigger missing-source warnings before they're built.

### Other rules worth pre-empting

- **No duplicate edges by `(from, to, relationship)`.** The validator rejects the second occurrence and points at the first by id. If you genuinely need two concerns between the same pair (e.g. `service → db` for both `reads` and `writes`), use distinct relationships.
- **Parent / child `sourcePath` containment.** When a parent and a child both declare `sourcePath` and the parent's path is a directory, the child's path MUST be inside the parent's. `module: src/orders` → `function: src/orders/api.ts` is fine; `module: src/orders` → `function: src/payments/api.ts` is rejected.
- **No coordinates** (`x`, `y`, `width`, `height`, `viewport`). Layout is computed by ELK on every render. The schema rejects them.
- **No empty arrays.** `notes`, `responsibilities`, `interfaces` — either include real entries or omit the field.
- **Renaming an `id` is forbidden.** Remove the old node and add a new one. Renames break diff and require manual re-link in code.
- **Don't drop user-authored fields.** `description`, `responsibilities`, `notes` carried forward must stay intact.

## Design heuristics — apply these in DESIGN

Run a candidate through this checklist before staging a sidecar. Each item is a yellow flag — flag them in your rationale rather than hiding them.

- **One reason to change.** Each new node has a single responsibility expressible in one sentence. If `description` rambles, decompose.
- **Bounded contexts.** Name the context this change belongs to. A change spanning two contexts usually means a missing third (orchestrator, port, gateway).
- **Async at context boundaries.** Default cross-context coupling to `publishes` / `subscribes` over a stream/queue. `http_call` across contexts is allowed but should be justified (sync-required RPC, query for read-side data).
- **Composition over sprawl.** Group related nodes under a `module` parent via `parentId`. Flat top-level lists past ~8 nodes are a smell.
- **Ports & adapters at the edge.** External integrations sit behind an `external` node, never inline in a service. Port (interface) + adapter (concrete) is preferred when the integration could swap.
- **Public traffic → gateway/auth upstream.** Anything user-facing routes through a `gateway`/`auth` node, not directly to a service.
- **Failure modes.** Async producers imply DLQ/retry on the consumer; `http_call` implies timeout + circuit. Don't draw the happy path alone.
- **Lifecycle honesty.** Code-bearing node without code on disk → `status: proposed`. About to be removed → `status: deprecated`.

## When to propose, when to defer

**Propose a sidecar (don't silently apply) when work changes shape:**

- New service, function, worker, frontend, queue, DB, etc.
- New dependency between existing components.
- New external API integration.
- Removing or renaming a component.
- Splitting one component into several, or merging several into one.

Frame it as: *"This adds a `payments-worker` reading from the `order-events` queue. Want me to stage that as an archik suggestion?"* — wait for confirmation or for the user to type `/archik:suggest`.

**Leave the diagram alone for:**

- Pure refactors that don't change the component graph.
- Local file moves / renames.
- Bug fixes inside an existing node.

The diagram tracks **shape**, not implementation detail.

## Follow-ups (do this after every accept / reject)

After a suggestion is accepted, the diagram has changed. Don't just stop — propose what's natural next. Pick whichever fits:

1. **Implement the change.** If the suggestion added a new node (e.g. a worker, a queue), the code doesn't exist yet. Offer to scaffold it: *"The diagram now shows `payments-worker` subscribing to `order-events`. Want me to scaffold `src/workers/payments/` with a stub consumer?"*
2. **Improve.** If the change exposed bigger architectural smells (a god service, a missing port/adapter pair, a leaky boundary), suggest `/archik:evolve`: *"Worth running `/archik:evolve` on the `orders` module? It's now wired to four downstream services and might want a clearer port."*
3. **Diff vs reality.** Offer to spot-check the source tree against the new diagram: `npx archik drift`.
4. **Render.** If the project commits a rendered SVG (`docs/architecture.svg`), regenerate it: `npx archik render --out docs/architecture.svg`.

After a rejection, **never go silent and never silently retry the same draft.** Ask a question pinned to one of these axes — the answer becomes a constraint when you regenerate:

- **Boundary** — *"Did the wrong context own a node? Should `payments-worker` live under `orders` or `billing`?"*
- **Relationship** — *"Was a sync `http_call` wrong where you wanted `publishes` / `subscribes`?"*
- **Scope** — *"Too big? Want me to try a smaller delta that only touches the queue, not the worker?"*
- **Naming** — *"Was the id/name unclear? What would you call it?"*
- **Composition** — *"Should this be one node, or split into a port + adapter pair?"*
- **Lifecycle** — *"Should this be `status: proposed` for now and flipped to `active` once the code lands?"*

Then loop back to DESIGN with the rejection reason as a hard constraint.

## Optional sharpening — `superpowers:*` skills (if installed)

The loop is self-contained, but these sharpen specific phases when the user has them. Check the available-skills list at session start; never assume they exist.

| Phase   | Skill                                          |
| ------- | ---------------------------------------------- |
| Design  | `superpowers:brainstorming`                    |
| Build   | `superpowers:writing-plans`,                   |
|         | `superpowers:test-driven-development`,         |
|         | `superpowers:requesting-code-review`           |
| Verify  | `superpowers:verification-before-completion`   |

## Sequence diagram schema reference

```yaml
version: "1.0"          # required, literal
name: "Login flow"      # required, non-empty
description: "..."      # optional

participants:           # required, at least one
  - id: browser         # participant ref id (used in steps)
    nodeId: frontend    # architecture node id this participant maps to
                        # node's kind drives the participant header icon/color
    label: Browser      # optional display label (defaults to nodeId)
    status: proposed    # optional — proposed | active | deprecated

steps:                  # ordered list of messages, notes, groups
  # --- message ---
  - type: message
    id: m1
    from: browser       # participant id
    to: api             # participant id
    label: POST /login
    arrow: sync         # sync | async | return | create | destroy
    activate: true      # optional — draws activation box on receiver
    status: proposed    # optional

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
    label: "checkout flow"
    seqFile: .archik/checkout-flow.archik.seq.yaml
                                   # makes the frame clickable in the UI
    branches: []                   # required (can be empty for ref)
```

**Arrow types:**

| arrow     | meaning                                                     |
| --------- | ----------------------------------------------------------- |
| `sync`    | synchronous call (solid line, filled arrowhead)             |
| `async`   | fire-and-forget (solid line, open arrowhead)                |
| `return`  | return value (dashed line, open arrowhead)                  |
| `create`  | object creation (dashed line, filled arrowhead + `«create»`) |
| `destroy` | object destruction (solid line, × marker at target)         |

**Group kinds:** `alt` (conditional), `opt` (optional), `loop`, `par` (parallel), `break`, `ref` (reference)

**Validator checks for seq diagrams:**
- All seq files referenced in `seqFiles` exist on disk.
- Each seq file parses as valid YAML and matches the seq schema.
- Participant `nodeId` fields reference real node ids from the architecture.
- No duplicate step ids within a seq file.

## Full CLI reference

Run `npx archik <cmd> --help` for the per-command surface.

```
npx archik schema                       # the document shape (start here when authoring)
                  --json                #   structured shape for piping into jq
                  --seq                 #   seq diagram schema instead of arch schema

npx archik q describe <id> | deps <id> | dependents <id>
                  list | edges | impact <id> | stats
                  sequences [--node <id>]   # list seq diagrams; --node filters to flows involving a node
                  --json                #   stable machine-readable shape

npx archik validate <path> [--json]     # schema + cross-file check (CI-friendly)
npx archik render --out diagram.svg --theme light|dark
              render --seq <path> --out seq.svg --theme light|dark
npx archik diff a.yaml b.yaml [--out diff.svg] [--json]
npx archik drift [--json] [--ignore <file>]   # diagram vs source tree

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

## Things to avoid

- Don't `cat`, `Read`, `Write`, or `Edit` archik architecture files (`.archik/`, `*.archik.yaml`, sidecars). The CLI owns them.
- Don't author drafts from memory; run `npx archik schema` first.
- Don't add coordinates (`x`, `y`, `width`, `height`, `viewport`).
- Don't add empty `notes` / `responsibilities` / `interfaces` — either include real entries or omit the field.
- Don't blow away user-authored fields when carrying a node forward.
- Don't bulk-restructure as a side effect of a small edit. Make the minimal change that captures what changed.
- Don't silently retry a rejected draft. Ask one specific question, treat the answer as a hard constraint, then re-stage.
- Don't end on "done" after `accept`. Propose the natural next step (implement, evolve, drift-check, render).
