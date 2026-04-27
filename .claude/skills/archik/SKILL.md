---
name: archik
description: Use whenever .archik/main.archik.yaml or architecture.archik.yaml exists in the project, or the user asks about the system's architecture, services, dependencies, or data flow. The YAML is the shared map of the project between the user and Claude — read it before answering structural questions, and propose updates when work introduces or changes nodes/edges. Also covers the archik CLI for validation and rendering.
---

# Archik — the project's shared map

The archik file is **the user's source of truth for what the system
looks like**. It lists every meaningful node (services, databases,
queues, frontends, external APIs, …) and the edges between them.
The canvas in the browser is a stateless projection of this file —
when the user says "the orders service" or "the events queue", they
mean the entity with that `id` in the YAML.

The file lives in one of two places, in this order of preference:

1. `.archik/main.archik.yaml` — the new convention. Keeps the
   project root tidy and leaves room for sub-architectures (other
   `.archik/*.archik.yaml` files for individual components).
2. `architecture.archik.yaml` — the legacy root location, still
   fully supported.

Run `archik validate` (or check both paths) to find which one the
project uses. Don't assume — small differences here matter.

Treat the file as a shared vocabulary. It exists so the user and
you can talk about the system without re-explaining it every time.

## Protocol

1. **Before** answering structural questions — *"what does X do?",
   "what depends on Y?", "where does data flow when …?"* — read
   the archik file. Don't guess from filenames or memory.
2. **When** work introduces, removes, or rewires components, write
   the proposed end-state to a sibling `*.suggested.yaml` next to
   the main file (same schema, plus a `metadata.suggestion` block —
   see "Suggesting changes" below). Don't edit the main file
   directly; the user reviews and accepts in the canvas or via
   `archik suggest accept`.
3. **After** every edit to a YAML, run `archik validate`. Fix any
   reported errors before declaring the change done.

The sections below are the detailed reference behind these three
rules — *when* to consult, *when* to propose, schema, taxonomy,
relationship vocabulary, and CLI.

## Suggesting changes (the sidecar workflow)

The archik file is the user's source of truth. You don't get to
mutate it directly. Instead, write your proposed end-state to a
sidecar file in the same directory, with the same stem plus
`.suggested`:

```
# new convention
.archik/main.archik.yaml             ← truth — user owns it
.archik/main.archik.suggested.yaml   ← your draft proposal

# legacy layout — same naming rule, just at the root
architecture.archik.yaml
architecture.archik.suggested.yaml
```

The sidecar is a complete, valid Archik document — same schema as the
main file, plus a `metadata.suggestion` block that marks it as a
proposal:

```yaml
version: "1.0"
name: My Architecture
metadata:
  suggestion:
    from: .archik/main.archik.yaml
    at: 2026-04-26T17:00:00Z
    note: add Stripe payment flow         # optional one-liner
nodes:
  # ... entire proposed end-state, not just the delta
edges:
  # ...
```

Once you've written the sidecar:

* The canvas shows a **📝 Suggestion pending** banner with `Review`,
  `Accept`, `Reject` buttons. Review **toggles an in-canvas overlay
  on the same page** — added nodes/edges get green frames, removed
  ones get red dashed frames and dim out, changed ones get amber
  frames, and each gets a `+` / `−` / `~` badge. The button label
  flips to "Hide diff" while the overlay is on; click again to drop
  back to the regular view. Accept renames the sidecar over the main
  file; Reject deletes the sidecar. Both also clear review mode so
  the canvas snaps back to the new truth.
* From the terminal: `archik suggest show | accept | reject`.

If the user has no canvas open and asks "apply it", run
`archik suggest accept` for them (only after they've explicitly
asked).

**Key rules:**

* Write the *full proposed document*, not a patch. The diff is
  computed by archik between the main file and the sidecar.
* Run `archik validate architecture.archik.suggested.yaml` after
  writing. The schema enforces cross-references (no dangling edges,
  no parent cycles, no duplicate ids); silent failures are not OK.
* If a suggestion sidecar already exists, treat it as your previous
  proposal — extend or replace it. Don't write a new sidecar with a
  different name.

## When to consult the YAML

Read it **before answering** any of these:

- "What does X do?" / "What's the responsibility of X?"
- "What writes to / reads from / publishes to Y?"
- "Where does data flow when …?"
- "What services exist?" / "What's in the architecture?"
- "What depends on Z?" / "What would break if I remove Z?"
- "Is there a queue / cache / gateway already?"

Don't guess. The YAML has the answer or it doesn't — if it doesn't, say
so and offer to add it.

## When to propose updates to the YAML

Proactively suggest edits (don't silently apply them — the user owns
this file) when the work you're doing changes the structure:

- Adding a new service, function, worker, frontend, queue, DB, etc.
- Introducing a new dependency between existing components.
- Adding a new external API integration.
- Removing or renaming a component.
- Splitting one component into several, or merging several into one.

Frame it as: *"This adds a `payments-worker` that reads from the
`order-events` queue and writes to `payments-db`. Want me to update
the archik file to capture that?"*

## When to defer

- Pure refactors that don't change the component graph → leave it alone.
- Local file moves / renames → leave it alone.
- Bug fixes inside an existing node → leave it alone.

The YAML tracks **shape**, not implementation detail.

## Hard rules for editing

The schema enforces these — `archik validate` will reject the file
if you break any of them, so don't bother trying.

- **Never put coordinates** (`x`, `y`, `width`, `height`, `viewport`) in
  the YAML. Layout is computed by ELK on every render. The schema
  rejects unknown keys at root, node, edge, and metadata levels.
- **Every id matches** `^[a-z][a-z0-9-]*$` — lowercase, starts with a
  letter, hyphens allowed.
- **Node ids and edge ids are unique** within their respective lists.
  Duplicates fail validation.
- **Edges reference existing nodes**. If `from` or `to` doesn't match
  a node id, the document fails to load.
- **No self-loop edges** — `from === to` isn't meaningful for an
  architecture diagram and the schema rejects it.
- **`parentId` references an existing node** (any kind — typically a
  `module` or `custom` container, but any node-with-children renders
  as a container).
- **No `parentId` cycles** — a → b → a, or a node with itself as parent.
- **Any node with children is rendered as a container** regardless of
  kind. So you can have a `frontend` "Web App" containing `module`
  sub-areas, or a `service` containing `adapter` children — the icon
  and KIND tag in the header still reflect the node's own kind.
- **Don't rename a node id**. Remove the old node and re-add it with
  the new id, then fix every edge / parentId that referenced it.
- **Don't change `version`** — it's `"1.0"`.

## Schema (top-level)

```yaml
version: "1.0"          # literal — must be "1.0"
name: My Architecture   # required
description: ...        # optional
nodes: [ ... ]          # required, may be empty
edges: [ ... ]          # required, may be empty
metadata:               # optional
  createdAt: "..."
  updatedAt: "..."
```

## Node fields

```yaml
- id: orders            # required, kebab-case
  kind: service         # required, see taxonomy below
  name: Orders          # required, human-readable
  description: ...      # optional, free text
  stack: Go + Postgres  # optional, technology label shown under name
  responsibilities:     # optional, string list
    - place orders
    - track shipments
  interfaces:           # optional, list of contract specs
    - name: POST /orders
      protocol: http
      description: ...  # optional
  notes:                # optional, list of free-text notes
    - "Migrated from monolith in 2024."
  parentId: platform    # optional, must reference a real node
  archikFile: .archik/orders.archik.yaml   # optional drill-down
  metadata:             # optional, free record
    team: fulfillment
```

### Cross-file edges (`fromFile` / `toFile`)

Edges can also point at a node that lives in a peer file. Set
`toFile` (or `fromFile`) to that file's relative path; the canvas
won't draw the edge itself but will hang an "↗" badge on the local
endpoint, with the target file in the tooltip. Click → navigate.

```yaml
edges:
  - id: api-pays
    from: api                              # local node
    to: charge-handler
    toFile: .archik/payments.archik.yaml   # peer file
    relationship: http_call
    label: charge
```

Constraints (the schema enforces them):

- The cross-file path follows the same rules as `archikFile` (relative,
  forward slashes, no `..`, ends in `.archik.yaml`).
- The *local* endpoint id must still match a node in this file.
- An edge with **both** `fromFile` and `toFile` is rejected — author
  it inside one of the two referenced files instead.

### Drilling into a sub-architecture (`archikFile`)

A node can point at *its own* archik file via `archikFile`. The
canvas shows a small "↓ open" badge on those nodes; clicking it
loads the linked file and adds a breadcrumb so the user can come
back. Use it when a component is meaty enough to deserve its own
diagram (a service with internal modules, a frontend with several
panes, etc.).

Constraints (the schema enforces them):
- Relative path only — no leading `/`, no Windows drive letter.
- Must use forward slashes; `..` segments are rejected.
- Must end in `.archik.yaml` (the suggestion sidecar is derived
  automatically as `<stem>.suggested.yaml` next to it).
- Cycles aren't checked at parse time (each file validates on its
  own); if you wire a loop the canvas just lets the user navigate
  in and out.

Conventional layout: keep sub-files under `.archik/` next to
`main.archik.yaml`. Example:

```
.archik/main.archik.yaml          # entry point
.archik/orders.archik.yaml        # Orders service internals
.archik/payments.archik.yaml      # Payments service internals
```

## Node kinds (27 total, grouped by purpose)

| Group       | Kinds |
| ----------- | --------------------------------- |
| Compute     | `service`, `function`, `worker`, `agent` |
| Data        | `database`, `cache`, `vectordb`, `storage` |
| Messaging   | `queue`, `topic`, `stream` |
| Networking  | `gateway`, `cdn`, `route` |
| Hexagonal   | `interface`, `adapter`, `port` |
| AI / ML     | `llm`, `prompt`, `tool` |
| Identity    | `auth` |
| Observability | `observability` |
| Cloud       | `cloud` |
| UI          | `frontend` |
| External    | `external` |
| Structural  | `module`, `custom` |

Picking the right kind:

- A long-running HTTP service → `service`
- A serverless function / lambda → `function`
- A background job consumer → `worker`
- An autonomous AI agent driving tools → `agent`
- Postgres / DynamoDB / etc → `database`
- Redis / Memcached → `cache`
- Pinecone / pgvector / Weaviate → `vectordb`
- S3 / GCS / blob → `storage`
- SQS / RabbitMQ work queue → `queue`
- SNS / Kafka pub/sub topic → `topic`
- Kafka / Kinesis stream-of-events → `stream`
- API gateway, ingress, edge proxy → `gateway`
- CloudFront / Fastly → `cdn`
- A specific HTTP route / URL endpoint (e.g. `POST /v1/orders`) → `route`
- An abstract contract → `interface`
- A concrete impl of an interface → `adapter`
- A hexagonal-architecture port → `port`
- An LLM API (OpenAI, Anthropic) → `llm`
- A reusable prompt template → `prompt`
- An LLM-callable tool → `tool`
- Auth0 / Clerk / IDP → `auth`
- Datadog / Grafana / OTEL collector → `observability`
- A managed cloud service that doesn't fit → `cloud`
- Browser / mobile / CLI → `frontend`
- Third-party API you don't run → `external`
- A logical grouping container (component, module) → `module`
- Anything that doesn't fit and you want a custom shape → `custom`

**Distinct visual shapes** (not just an icon — the *outline* differs):

| Kind | Shape |
| ---- | ----- |
| `database` | classic UML cylinder |
| `cloud` | cumulus cloud silhouette |
| `queue` | rounded capsule (pill) |
| `external` | dashed-border card |
| `module` / `custom` (with children) | container panel with header + tinted body |

Every other kind renders as the standard rounded card — the kind icon
in the header and the KIND label do the visual lifting. Don't expect
each kind to have its own outline; the icon + KIND tag is the
identity.

**Containers**: any node with children (declared via other nodes'
`parentId`) renders as a container, regardless of kind. So
`frontend` "Web App" can contain `module` sub-areas, a `service`
can contain hexagonal `port`/`adapter` children, etc. The kind of
the container itself controls the icon + accent colour shown in the
header bar.

## Edge fields

```yaml
- id: api-db            # required, kebab-case
  from: api             # required, must be a node id
  to: db                # required, must be a node id
  relationship: writes  # required, see vocabulary below
  label: "create order" # optional, shows on the canvas
  description: ...      # optional
  protocol: http        # optional
  color: "#f97316"      # optional, any CSS color (hex / named / var())
```

## Relationships (17 total)

| Category       | Relationship | Visual signature |
| -------------- | ------------ | ---------------- |
| Sync wire      | `http_call`     | dotted, animated, filled-triangle arrow |
|                | `grpc`          | thicker dashed, animated, **double-tick chevron** arrow |
|                | `invokes`       | dotted, animated, filled-triangle arrow |
|                | `routes_to`     | solid, no animation |
| Bidirectional  | `websocket`     | dashed, **fast** animation, **arrows on both ends** |
| Async callback | `webhook`       | long-dash dashed, animated, hollow-triangle arrow |
| Data access    | `reads`         | dotted, animated, hollow-triangle arrow |
|                | `writes`        | thicker dotted, animated, filled-triangle arrow |
| Messaging      | `publishes`     | dotted, animated, **circle** arrow head |
|                | `subscribes`    | dotted, animated, filled-triangle arrow |
|                | `streams_to`    | long-dash, **fast** animation, filled-triangle |
| UML structural | `implements`    | dashed, **hollow-triangle** at the interface end (UML realisation) |
|                | `extends`       | solid, **hollow-triangle** at parent end (UML inheritance) |
|                | `composes`      | solid, **filled-diamond at the owner (source) end** (UML composition) |
| Loose deps     | `depends_on`    | dashed, hollow-triangle arrow |
|                | `has_a`         | solid, filled-triangle (informal composition) |
|                | `uses`          | short-dash, hollow-triangle (lightest dependency) |

Picking the right relationship:

**Wire-protocol calls** (something is going over the network *now*):
- Generic HTTP / REST call → `http_call`
- Typed RPC (protobuf, Connect, Twirp) → `grpc`
- Function / agent / lambda invocation → `invokes`
- Gateway / ingress routing → `routes_to`
- Long-lived bidirectional connection (chat, live trading, collab) → `websocket`
- Async callback the *other party* pushes to *us* (Stripe webhook, GitHub event) → `webhook`

**Data access**:
- DB read query → `reads`
- DB write / mutation → `writes`

**Messaging**:
- Emitting an event / message → `publishes`
- Consuming an event / message → `subscribes`
- Continuous stream of records (Kafka, Kinesis, log shipping) → `streams_to`

**UML class-diagram structural** (drawn in the same style as a UML class diagram, so the visual matches what an engineer expects on a board):
- Adapter realises an abstract interface → `implements`
- Subclass / subtype inherits → `extends`
- Whole owns the part's lifecycle (component composition) → `composes`

**Looser architectural** (not UML-strict — for "X depends on Y" without claiming a specific relationship):
- Package / build-level dependency → `depends_on`
- Informal "has a" without lifecycle ownership → `has_a`
- Lightest weight: "X uses Y somewhere" → `uses`

## Common editing patterns

**Adding a service that writes to a database**:

```yaml
nodes:
  - id: payments
    kind: service
    name: Payments
    stack: Go
  - id: payments-db
    kind: database
    name: Payments DB
    stack: Postgres 16
edges:
  - id: payments-writes-db
    from: payments
    to: payments-db
    relationship: writes
```

**Adding an LLM agent with tools**:

```yaml
nodes:
  - id: support-agent
    kind: agent
    name: Support Agent
    description: Handles tier-1 customer questions.
  - id: openai
    kind: llm
    name: GPT-4o
  - id: lookup-orders
    kind: tool
    name: Lookup orders
edges:
  - id: agent-llm
    from: support-agent
    to: openai
    relationship: invokes
  - id: agent-uses-tool
    from: support-agent
    to: lookup-orders
    relationship: uses
```

**Grouping nodes inside a module**:

```yaml
nodes:
  - id: orders-module
    kind: module
    name: Orders
  - id: orders-api
    kind: service
    name: Orders API
    parentId: orders-module
  - id: orders-db
    kind: database
    name: Orders DB
    parentId: orders-module
```

ELK will nest them visually inside the module's container.

**Adding a hexagonal port + adapter**:

```yaml
nodes:
  - id: payment-port
    kind: port
    name: Payment Port
  - id: stripe-adapter
    kind: adapter
    name: Stripe Adapter
edges:
  - id: stripe-implements-port
    from: stripe-adapter
    to: payment-port
    relationship: implements
```

**Modelling a real-time chat with WebSocket + a Stripe webhook**:

```yaml
nodes:
  - id: web
    kind: frontend
    name: Web App
  - id: api
    kind: service
    name: Chat API
  - id: stripe
    kind: external
    name: Stripe
edges:
  - id: web-api-ws
    from: web
    to: api
    relationship: websocket             # bidirectional, fast animation
    label: messages
  - id: stripe-api-webhook
    from: stripe
    to: api
    relationship: webhook               # async callback
    label: payment.succeeded
```

**gRPC between two Go services + UML class hierarchy**:

```yaml
nodes:
  - id: orders
    kind: service
    name: Orders
  - id: payments
    kind: service
    name: Payments
  - id: order
    kind: interface
    name: Order
  - id: subscription-order
    kind: interface
    name: SubscriptionOrder
  - id: cart
    kind: custom
    name: Cart
edges:
  - id: orders-payments-grpc
    from: orders
    to: payments
    relationship: grpc                  # double-tick chevron
    label: ChargeRequest
  - id: subscription-extends-order
    from: subscription-order
    to: order
    relationship: extends               # UML hollow triangle
  - id: cart-composes-order
    from: cart
    to: order
    relationship: composes              # UML filled diamond at Cart
```

## CLI

These commands are available globally if archik was installed via
`npm link`. Without a positional path, each command resolves the
archik file in this order: `.archik/main.archik.yaml` (preferred),
then `architecture.archik.yaml` (legacy). If both exist the
command errors and asks the user to pick one.

```
archik validate                    # schema check (run after every edit)
archik validate path/to/file.yaml
archik render --out diagram.svg    # headless layout → SVG
archik render --theme light --out diagram-light.svg
archik diff a.yaml b.yaml          # text + colour-coded SVG diff
archik diff a.yaml b.yaml --out diff.svg
archik suggest show                # summary of pending sidecar (default)
archik suggest accept              # apply the sidecar over the main file
archik suggest reject              # discard the sidecar
archik watch                       # re-render SVG on save
archik check                       # drift: nodes vs source dirs
archik dev                         # open the live editor in the browser (foreground)
archik start                       # same as dev, detached — returns the prompt
archik stop                        # stop the background server
archik status                      # list running archik instances
archik init                        # scaffold a starter file (also installs this skill into ./.claude/skills/archik/ unless --no-skill)
archik skill                       # install/refresh this skill in cwd
```

If `archik` isn't on PATH (the user hasn't run `npm link` yet), fall
back to the in-repo form: `npm run archik -- <command>` from the
archik checkout.

## Verification workflow

After **every** edit you make to the archik file:

1. Run `archik validate` — fix any reported errors before declaring
   the change done. Schema errors include the path of the offending
   field so you can fix them precisely.
2. If the project has an `archik dev` server running, the file watcher
   broadcasts the change automatically — no restart needed.
3. If the project commits a rendered SVG (e.g. `docs/architecture.svg`),
   regenerate it with `archik render --out docs/architecture.svg` so
   the committed picture matches the YAML.
4. For nodes whose `kind` implies code (`service`, `function`, `worker`,
   `agent`, `frontend`, `gateway`, `tool`, `module`), consider
   `archik check` to flag nodes that don't have a matching source
   folder under `src/`, `services/`, `packages/`, or `apps/`.

## Things to avoid

- Don't invent kinds or relationships outside the lists above — the
  Zod schema rejects them.
- Don't add visual properties (colors, sizes, positions) to nodes.
  Only edges have `color`. Everything else comes from the renderer.
- Don't add empty `notes` / `responsibilities` / `interfaces` lists —
  either include real entries or omit the field entirely.
- Don't blow away `description`, `responsibilities`, or `notes` the
  user wrote unless they ask you to. They're encoded context.
- Don't bulk-restructure the file as a side effect of a small edit.
  Make the minimal change that captures what changed.
