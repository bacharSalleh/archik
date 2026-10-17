---
name: archik
description: Use whenever .archik/main.archik.yaml or architecture.archik.yaml exists in the project, or the user asks about architecture, services, dependencies, or data flow. The YAML is the shared map between user and Claude. Interact with it ONLY through the `npx archik` CLI — `q` for queries, `schema` for shape, `suggest set` for proposals, `validate` after every change. Never read, write, or edit archik files manually.
---

# Archik — the project's shared map

## Mental model (read this first)

- **The YAML is the source of truth.** `.archik/main.archik.yaml` (and any `*.archik.yaml` sub-files) describe the system the user is building. The browser canvas is just a stateless projection of that file.
- **The CLI is your only interface to it.** You never read, write, or edit archik files directly. Every read goes through `npx archik q ...`; every write goes through `npx archik suggest set` → user accepts via `/archik:accept`.
- **Every change says why.** A draft carries a short decision record (context, decision, alternatives, consequences). Accept writes it to `.archik/decisions/NNNN-<slug>.md`. The diagram is the *what*; the records are the *why*. Read past records before you change a structure they explain — they are plain markdown, so reading them directly is fine (the "CLI only" rule is about the YAML model files).
- **Two command surfaces:** the user types `/archik:*` slash commands; you run `npx archik ...` directly. They're not interchangeable — see the tables below.
- **One change to ship, not the whole system.** When a user hands you a brief on a fresh project, never say "let me sketch your whole system." Propose the smallest structure that delivers the first piece of value. New code-bearing nodes start `status: proposed` (the code doesn't exist on disk yet) and flip to `status: active` when the code lands in BUILD. The project's commitments live in the YAML, not in the chat log.
- **Read the learned overlay at session start.** If `.archik/evolution/learned.md` exists, read it (with the Read tool — it is docs, not an archik YAML) before your first archik action and treat every note as binding guidance. Each note is a lesson this project's evolution loop gathered from real usage and a human approved. After a suggestion of yours is rejected, run `npx archik evolution reflect` — repeated rejections become proposals the user can review.

## Command surfaces

### The user types these (slash commands)

These are the user's entry points. They're triggered by the user typing `/archik:<name>` in chat. When you see one, it's the user's authorisation to run the corresponding workflow now — skip the "want me to update the YAML?" question.

| Slash command                     | What the user is asking for                                       |
| --------------------------------- | ----------------------------------------------------------------- |
| `/archik:bootstrap`               | **Start here on a new project.** Detect state (fresh / has-code / already-modelled) and route to the right next action — ask for a brief, suggest `/archik:spawn`, or surface drift and smells. |
| `/archik:spawn`                   | Mirror the source tree as a first-pass diagram (descriptive)      |
| `/archik:evolve`                  | Propose a cleaner bounded-context refactor (prescriptive)         |
| `/archik:suggest <…>`             | Apply one feature-sized change from a description (targeted)      |
| `/archik:describe <id>`           | Explain a node and its connections                                |
| `/archik:dev`                     | Open the live canvas                                              |
| `/archik:accept`                  | Apply the pending sidecar suggestion                              |
| `/archik:reject`                  | Discard the pending sidecar suggestion                            |
| `/archik:self-evolving <idea>`    | Design a self-evolving architecture for the user's idea, using the pattern library |

The full protocol for each lives at `commands/<name>.md` in the repo (or `.claude/commands/archik/<name>.md` once installed in a project). Follow it when invoked.

### You run these (`npx archik` CLI)

These are the verbs you reach for during the loop. Default to `npx archik` (no global install needed).

| Need                              | Command                                       |
| --------------------------------- | --------------------------------------------- |
| Get the document schema           | `npx archik schema`                           |
| Inspect the current diagram       | `npx archik q list \| edges \| stats`         |
| Look up one node                  | `npx archik q describe <id>`                  |
| Find dependencies / impact        | `npx archik q deps \| dependents \| impact <id>` |
| See one node + its neighbors      | `npx archik q neighbors <id> [--depth N]`     |
| Map changed files onto the model  | `npx archik affected [--since <ref>] [--files <list>] [--json]` |
| Verify edges against the code     | `npx archik drift --edges [--json]`           |
| Validate a file                   | `npx archik validate <path>`                  |
| Spot over-complex files / hubs    | `npx archik complexity [--fail-on-warn]`      |
| Find folder loops / oversized files | `npx archik smells [dir] [--json] [--fail-on-warn]` |
| Accept today's smells as known debt | `npx archik smells --update-baseline` (commit `.archik/smells-baseline.json`) |
| Stage a proposed change           | `npx archik suggest set --note '…' - <<'YAML' … YAML` |
| Show / accept / reject pending    | `npx archik suggest show \| accept \| reject` |
| Render an SVG                     | `npx archik render --out diagram.svg`         |
| Render one area / drop weak edges | `npx archik render --focus <id>` / `--hide-structural` |
| Diff two files or git refs        | `npx archik diff a.yaml b.yaml` / `npx archik diff origin/main` |
| Detect drift vs source tree       | `npx archik drift`                            |
| Open the live canvas (foreground) | `npx archik dev`                              |
| Open the canvas (detached)        | `npx archik start` / `stop` / `status`        |
| Evolution loop state              | `npx archik evolution status [--json]`        |
| Turn usage history into proposals | `npx archik evolution reflect`                |
| File a proposal yourself          | `npx archik evolution propose - <<'YAML' … YAML` |
| Self-evolution pattern library    | `npx archik patterns list \| show <id> \| apply <id>` |
| Per-command help                  | `npx archik <cmd> --help`                     |

## Hard rule: the CLI is the only interface to archik files

You MUST NOT use `Read`, `Write`, or `Edit` against any file under `.archik/`, any `*.archik.yaml`, any sidecar (`*.archik.suggested.yaml`), or `architecture.archik.yaml`. The CLI owns reads, writes, validation, schema, and lifecycle.

If `npx archik` is unreachable (offline, sandboxed, missing), STOP and tell the user. Do NOT fall back to reading or editing YAML by hand.

## The engineering loop (how archik fits into delivering work)

Every structural change runs the loop. Don't skip phases; don't silently retry on rejection; don't paper over a wrong design mid-build — go back.

```
  ┌────────────┐  q stats / list / source tree.
  │  DISCOVER  │  Read before write. Map intent onto what already
  └─────┬──────┘  exists.
        │
  ┌─────▼──────┐  Frame intent in one line + 1–3 sharp clarifying Qs.
  │   DESIGN   │  Stage sidecar (`suggest set`) with its decision
  │            │  record: context, decision, alternatives,
  └─────┬──────┘  consequences.                ◄── reject + reason ──┐
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
| Discover | Claude        | `npx archik q ...` + `npx archik affected` + `npx archik smells` + `ls` + past records in `.archik/decisions/` |
| Design   | Claude → User | sidecar via `suggest set`, with its decision record |
| Decide   | User          | `/archik:accept` or `/archik:reject` (HITL gate) — one-way doors alone, two-way doors together with the plan |
| Build    | Claude → User | numbered plan (own HITL approval for one-way doors), then small commits |
| Verify   | Claude        | `npx archik validate` + tests + `drift` + `smells` + SVG regen |

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
npx archik q neighbors orders-api          # this node + its immediate neighbors (depth 1)
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
metadata:
  suggestion:
    decision:
      context: Orders-api charges Stripe inline, so a slow Stripe call blocks checkout and a Stripe outage fails orders.
      decision: Move charging to a payments worker that subscribes to order.placed on the order-events stream.
      alternatives:
        - Keep the inline call with a shorter timeout and retries
        - Call a payments service synchronously over HTTP
      consequences: Checkout no longer waits on Stripe; payment becomes eventually consistent, so the UI must show a "payment pending" state.
      crossCutting:
        security: The worker alone holds the Stripe key (secret store); events carry order ids, not card data.
        observability: Consumer lag and failed-charge count on the payments dashboard, alert on lag over 5 minutes.
        rollback: A flag switches checkout back to the inline call; the stream is additive.
YAML
```

**The decision record is required** — `suggest set` refuses a draft without it, and accept writes it to `.archik/decisions/`. Write it for the reader who arrives in a year:

- **context** — the problem and the forces (load, failure modes, team limits). Facts, not the solution.
- **decision** — what you chose, in one or two sentences.
- **alternatives** — real options you weighed and did not choose. At least one. "Do nothing" counts when it was a real option.
- **consequences** — what gets easier AND what gets harder. A record with only upsides is not finished.
- **crossCutting** — required when the change adds data, an outside system or public traffic (the CLI tells you). **security**: who can reach it, secrets, data exposure. **observability**: the signal that shows it working or failing. **rollback**: how to undo it safely. Real answers — the build plan must land them.
- **supersedes** (optional) — record numbers this one replaces, e.g. `["0003"]`. Old records are never edited.

**One-way vs two-way doors.** `suggest set` and `suggest show` label each change. A **one-way door** (hard to undo) adds a data store, queue/stream, external system, gateway/auth/cdn, cloud or LLM node, a new edge to an external system or a top-level module, or removes a built node, or moves one to another parent. Hand it off alone and say why it is hard to undo; the build plan gets its own approval after accept. A **two-way door** is everything else — show the build plan in the same hand-off, and one `/archik:accept` approves both. Never skip review of a one-way door to save time.

**Model only what you know.** On a new project, model the first milestone in detail and the rest as coarse `proposed` module placeholders; detail each area when its milestone starts.

For a mechanical change (flip `proposed → active` after code lands), keep it short: context = what landed, decision = mark it active, alternative = keep it proposed until deploy, consequence = drift now checks it.

The CLI parses, schema-validates, checks cross-file references, stamps `metadata.suggestion`, and atomically writes the sidecar. If it exits non-zero, the error includes a hint pointing at the wrong field — fix the heredoc and re-run. **Never edit the sidecar by hand.**

```bash
# Step C — surface the canvas URL so the user can review the diff overlay
# (added/removed/changed get green/red/amber frames).
# Or terminal: `npx archik suggest show | accept | reject`.
```

### 3. Verify before declaring done

```bash
npx archik validate .archik/main.archik.yaml   # schema + cross-file + constraints
npx archik drift                                # diagram vs source tree
npx archik affected --json                      # what did this change touch? who depends on it?
npx archik smells                               # folder loops + oversized files, from the code
                                                # (with a baseline, only NEW findings count)
npx archik render --out docs/architecture.svg  # if the project commits an SVG
```

`affected` is also the right opener in DISCOVER when work starts from
an existing branch: `npx archik affected --since origin/main --json`
tells you which nodes, and which dependents of those nodes, the branch
already touches — ground your plan in that instead of re-deriving it.

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
metadata:
  suggestion:
    decision: { context: ..., decision: ..., alternatives: [...], consequences: ... }
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
metadata:
  suggestion:
    decision: { context: ..., decision: ..., alternatives: [...], consequences: ... }
YAML
```

When you auto-accept the sub-file, **narrate the rationale** so the user can tell you're not bypassing their `/archik:accept` review on the main draft. The main draft is always left as a sidecar.

## File modes — two modes, picked by filename

| Suffix                      | Mode          | When to use                                                                         |
| --------------------------- | ------------- | ----------------------------------------------------------------------------------- |
| `*.archik.yaml`             | **normal**    | The canonical architecture of code that exists.                                     |
| `*.archik.suggested.yaml`   | **suggested** | A pending change to a normal file. Owned by `suggest set`. Becomes normal on accept. |

There is no separate "discussion" file mode. Greenfield / exploratory work is expressed via `status: proposed` on the affected nodes and edges (see Lifecycle below). The diagram stays canonical.

## Required fields and validation rules

These rules are enforced by the validator. Pre-empt them when authoring.

### Every node needs a `description`

Empty strings rejected, missing values rejected. Explain what the node **does** — its responsibility, the work it performs, why it exists — not just its `kind` or `name`.

> Bad: *"A service."*  *"The orders module."*
> Good: *"Owns order placement and status — accepts cart payloads, validates inventory, writes to `orders` and emits `order.placed` to the stream."*

### Code-bearing kinds need a `sourcePath`

These kinds MUST declare a `sourcePath` that exists on disk: `service`, `function`, `worker`, `module`, `page`, `component`, `store`, `hook`, `model`, `dto`, `dataobject`.

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

### Node owner — who to talk to

Nodes may carry `owner: <team-or-person>` (free text — match the
project's CODEOWNERS vocabulary). Surface it when answering "who owns
this?" (`q describe`, `q list --owner <t>`). Carry it forward like any
user-authored field. If the document declares a `requireOwner`
constraint, new nodes of the matching kinds MUST include an owner or
validation fails.

### Governance constraints — document-level fitness rules

The root document may declare `constraints` — rules `archik validate`
enforces across the MERGED diagram (root + sub-files):

```yaml
constraints:
  - id: billing-isolation
    description: Only billing-context nodes may write to billing-db.
    forbidEdge:
      relationship: writes
      from: { notParent: billing }
      to: { id: billing-db }
  - id: services-owned
    description: Every service and worker declares an owning team.
    requireOwner: { kinds: [service, worker] }
  - id: workers-have-dlq
    description: Every worker publishes somewhere (DLQ discipline).
    requireEdge:
      node: { kind: worker }
      to: { kind: queue }
      relationship: publishes
  - id: no-god-services
    description: Services keep at most 6 outgoing dependencies.
    maxDependencies: { node: { kind: service }, max: 6 }
```

- Selectors: `{ id?, kind?, parent?, notParent? }` — all
  set fields must match; `parent`/`notParent` walk the whole parentId
  chain.
- Exactly one rule per constraint: `forbidEdge`, `requireOwner`,
  `requireEdge` (`node` + exactly one of `to`/`from` + optional
  `relationship`), or `maxDependencies` (`node` + `max` + optional
  `relationship`).
- `except: [<id>, …]` grandfathers specific node/edge ids — when a
  violation is intentional, add the id to `except` and say why in the
  suggestion note rather than weakening the rule.
- When `suggest set` or `validate` rejects with a constraint
  violation, treat the constraint as a hard design input: reroute the
  edge (usually via the context's own service or a port), don't
  delete the rule.

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
- **Composition over sprawl.** Group related nodes under a `module` parent via `parentId`. Flat top-level lists past ~8 nodes are a smell. Run `npx archik complexity` to catch this objectively — it flags over-large files, over-stuffed containers, hub nodes, and deep nesting, each with a concrete fix.
- **No folder loops.** Dependencies between sibling folders should flow one way. Run `npx archik smells` — it reads the code (no model needed) and reports folder loops with the real `file imports "specifier"` lines as evidence, plus the cheapest import to cut. Name smells by that evidence; don't invent labels.
- **Ports & adapters at the edge.** External integrations sit behind an `external` node, never inline in a service. Port (interface) + adapter (concrete) is preferred when the integration could swap.
- **Public traffic → gateway/auth upstream.** Anything user-facing routes through a `gateway`/`auth` node, not directly to a service.
- **Failure modes.** Async producers imply DLQ/retry on the consumer; `http_call` implies timeout + circuit. Don't draw the happy path alone.
- **Lifecycle honesty.** Code-bearing node without code on disk → `status: proposed`. About to be removed → `status: deprecated`.

## Keep views small

A big model isn't read by staring at one giant map — it's read one question at a time. Many small views beat one wall of nodes.

- **Answer questions with a query, not the whole diagram.** "What does X talk to?" → `npx archik q neighbors X` (or `q describe X`). Don't render the full map to answer a local question.
- **Let `complexity` tell you when to split.** Run `npx archik complexity` (advisory; `--fail-on-warn` for CI/hooks). When it flags a file or container, decompose: move a subsystem into its own `archikFile`, or group nodes under a `module` parent via `parentId`. Strict default limits — 15 nodes/file, 20 edges/file, 6 children/container, degree 6, nesting depth 3. These are hints, not blockers.
- **Focus when rendering.** `npx archik render --focus <id> [--depth N]` renders only a node's neighborhood; `--hide-structural` (or `--hide-rel`/`--only-rel`) drops weak edges (`uses`, `depends_on`, `has_a`, `implements`, `extends`) so the runtime shape stands out.
- **For humans on the canvas:** the live canvas has matching controls — collapse/expand containers, hide weak edges, and focus mode (select a node → "Focus on this node", with a depth stepper, Esc to exit). These are view-only and never change the YAML.

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

## Full CLI reference

Run `npx archik <cmd> --help` for the per-command surface.

```
npx archik schema                       # the document shape (start here when authoring)
                  --json                #   structured shape for piping into jq

npx archik q describe <id> | deps <id> | dependents <id>
                  list | edges | impact <id> | stats
                  neighbors <id> [--depth <n>]   # node + everything within N hops (default 1)
                  --json                #   stable machine-readable shape

npx archik validate <path> [--json]     # schema + cross-file + governance constraints
                                        #   prints an advisory complexity-hint count (never fails on it)
npx archik complexity [path] [--json]   # advisory report: over-large files, hub nodes, deep nesting
                  [--fail-on-warn]      #   exit 1 if any finding (CI / pre-commit gate)
                  [--max-nodes N] [--max-edges N] [--max-children N]
                  [--max-degree N] [--max-depth N]   # override the strict defaults
npx archik smells [dir] [--json]        # folder loops + oversized files, read from TS/JS code
                  [--fail-on-warn]      #   exit 1 on findings (only NEW ones if a baseline exists)
                  [--update-baseline]   #   save today's findings to .archik/smells-baseline.json
                  [--baseline <file>]   #   use another baseline file
                  [--max-file-lines N]  #   line limit per file (default 500)
                  [--fail-on-warn]      #   exit 1 if any smell (CI gate)
npx archik render --out diagram.svg --theme light|dark
              render --focus <id> [--depth N]        # render only a node's neighborhood
              render --hide-structural | --hide-rel <a,b> | --only-rel <a,b>   # filter edges
npx archik diff <a> [b] [--out diff.svg] [--json]
                                        # each side: YAML file OR git ref;
                                        # one arg = that ref vs working tree
npx archik affected [--since <ref>] [--files <list>] [--json]
                                        # changed files → nodes / dependents /
                                        #   model files / unmapped
npx archik drift [--json] [--ignore <file>]   # diagram vs source tree
                 [--edges]              # + verify edges vs the TS/JS import
                                        #   graph (shadow / phantom edges)
npx archik otel check --graph <deps.json> [--json]
                                        # verify edges vs a production
                                        # service-dependency graph export

npx archik suggest show [--json]
              suggest set <draft|->     # validate + stage a sidecar
                                        #   (draft needs metadata.suggestion.decision)
                  --note '<text>'       # set metadata.suggestion.note (record title)
                  --main <path>         # override main file detection
                  --allow-orphan        # permit a sidecar with no main on disk
                  --json                # structured output
              suggest accept | reject   # accept writes .archik/decisions/NNNN-*.md

npx archik migrate [--dry-run]          # bring this project's archik files up to the
                                        #   installed version; if validate says a key
                                        #   was "removed in archik 0.20", run this

npx archik dev | start | stop | status  # canvas server lifecycle
npx archik watch                        # re-render to SVG on save
npx archik init                         # scaffold + install skill + slash commands
npx archik import compose|mermaid [file] [--out <f>]
                                        # bootstrap a doc from docker-compose
                                        # or a Mermaid flowchart
npx archik merge-driver --install       # semantic git merge for *.archik.yaml
npx archik hooks install [--with-drift] # pre-commit validate gate
npx archik owners sync | check          # CODEOWNERS managed block from node owners
npx archik mcp                          # MCP server (for non-Claude-Code agents)
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
