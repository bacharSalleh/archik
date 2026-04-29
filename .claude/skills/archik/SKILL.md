---
name: archik
description: Use whenever .archik/main.archik.yaml or architecture.archik.yaml exists in the project, or the user asks about the system's architecture, services, dependencies, or data flow. The YAML is the shared map between the user and Claude. Interact with it ONLY through the `npx archik` CLI — `q` for queries, `suggest set` for proposals, `validate` after every change. Never read, write, or edit archik files manually.
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

Run `npx archik validate` (or check both paths) to find which one the
project uses. Don't assume — small differences here matter.

Treat the file as a shared vocabulary. It exists so the user and
you can talk about the system without re-explaining it every time.

## Hard rule: the CLI is the only interface to archik files

You MUST NOT use `Read`, `Write`, `Edit`, or any other file-touching
tool against `.archik/main.archik.yaml`, `architecture.archik.yaml`,
any `*.archik.yaml` sub-file, or any sidecar. The `npx archik` CLI is
the contract — it owns reads, writes, validation, and lifecycle.

| Need                          | Use                                       |
| ----------------------------- | ----------------------------------------- |
| Inspect structure             | `npx archik q ...`                        |
| Validate                      | `npx archik validate <path>`              |
| Propose a change              | `npx archik suggest set <draft>`          |
| Apply / discard a suggestion  | `npx archik suggest accept | reject`      |
| Render or diff                | `npx archik render` / `npx archik diff`   |

`.archik/main.archik.yaml` is the user's source of truth — only
`npx archik suggest accept` is allowed to mutate it. The sidecar
`.archik/main.archik.suggested.yaml` is owned by the CLI too — only
`npx archik suggest set` (writes it) and `accept` / `reject`
(consumes it) may touch it.

If `npx archik` is unreachable (offline, sandboxed, missing), STOP
and tell the user. Do NOT fall back to reading or editing YAML by
hand — that breaks the contract and silently desyncs the canvas.

The user-facing slash commands (`/archik:suggest`,
`/archik:describe`, `/archik:accept`, `/archik:reject`,
`/archik:dev`) are thin shims over this same CLI. When a user types
`/archik:suggest <description>`, treat it as direct authorisation to
run the sidecar workflow now — skip the "want me to update the YAML?"
question.

## Protocol

1. **Before** answering structural questions — *"what does X do?",
   "what depends on Y?", "where does data flow when …?"* — query
   the diagram with `npx archik q ...` (see CLI section). The CLI
   walks the root file plus every `.archik/*.archik.yaml` sub-file
   and returns focused, deterministic answers. Don't guess from
   filenames or memory, and don't read the YAML directly — see the
   hard rule above.
2. **When** work introduces, removes, or rewires components, author
   the proposed end-state in a workspace temp file (e.g.
   `/tmp/archik-draft-<id>.yaml`) and stage it as the sidecar with
   `npx archik suggest set <tmp> --note "<one-liner>"`. Do NOT
   write `.archik/main.archik.suggested.yaml` directly — the CLI is
   the only thing allowed to put files in `.archik/`. The user
   reviews and accepts in the canvas or via
   `npx archik suggest accept`.
3. **After** every `suggest set`, the CLI has already validated for
   you — schema, cross-file existence, the lot. If it exits non-zero,
   fix the temp draft and re-run; never patch the sidecar directly.
   For files outside `.archik/` (none, in a normal flow), use
   `npx archik validate <path>`.

The sections below are the detailed reference behind these three
rules — *when* to consult, *when* to propose, schema, taxonomy,
relationship vocabulary, and CLI.

## Grounding (do this once per session, before structural work)

The archik file tells you *what* exists. The source tree tells you
*where* it lives. The mapping between the two is the whole reason
the file is valuable — without it you just know there's "an Orders
service" but not where to go to read or edit it. So:

1. **Pull the diagram shape from the CLI.** Don't `cat` the YAML —
   use the query CLI:
   ```
   npx archik q stats     # files, node and edge counts, kind histogram
   npx archik q list      # every node, with kind and parent
   npx archik q edges     # every edge, with relationship and endpoints
   ```
   That gives you the same picture as reading the file, without
   touching it.
2. **List the source tree.** A single `ls` of the top-level project
   directory plus the most likely source roots is usually enough:
   `ls -F . src/ services/ packages/ apps/ 2>/dev/null`. (`ls
   .archik/` is fine for *finding out which sub-architectures
   exist*; don't open the YAMLs themselves — query them via
   `npx archik q list --file <name>`.)
3. **Build the mapping in your head.** Most projects follow one of
   two patterns: each top-level archik node id matches a folder
   under `src/` (or `services/` / `packages/`), or the `stack` /
   `description` field hints at the location. Note the mismatches
   — those are the places where moving a folder will outgrow the
   diagram, and where new code is most likely to need a YAML
   update too.
4. **Cross-check the source tree** when answering structural
   questions: most projects keep one folder per top-level node under
   `src/` (or `services/` / `packages/`). Mismatches are where
   moving code will outgrow the diagram and where new code most
   often needs a YAML update too.

When the user asks "where would I add X?" or "what's the right
place for Y?", you should already have the answer because step 3
gave it to you. When they ask "what would `archik render` show?",
run `npx archik render --out /tmp/preview.svg` and describe it.

## Suggesting changes (the sidecar workflow)

The archik file is the user's source of truth. You don't mutate it
directly, and you don't write the sidecar directly either — both are
under `.archik/` and only the CLI is allowed to touch that
directory (see the hard rule).

The flow is always the same:

1. Author the *full proposed end-state* document in a workspace temp
   file outside `.archik/`. Pick a path like
   `/tmp/archik-draft-<short-id>.yaml`.
2. Run `npx archik suggest set <tmp> --note "<one-liner>"`. The CLI
   parses, schema-validates, checks cross-file references, stamps
   `metadata.suggestion`, and atomically renames the draft into
   place as `.archik/main.archik.suggested.yaml` (or the legacy
   `architecture.archik.suggested.yaml`).
3. If `set` exits non-zero, fix the temp file based on the reported
   errors and re-run. Never patch the sidecar with `Edit`/`Write`.

A minimal draft looks exactly like a normal archik document — the
CLI fills in the suggestion marker for you, so you don't have to:

```yaml
version: "1.0"
name: My Architecture
nodes:
  # ... entire proposed end-state, not just the delta
edges:
  # ...
```

Once `suggest set` has succeeded:

* The canvas shows a **📝 Suggestion pending** banner with `Review`,
  `Accept`, `Reject` buttons. Review **toggles an in-canvas overlay
  on the same page** — added nodes/edges get green frames, removed
  ones get red dashed frames and dim out, changed ones get amber
  frames, and each gets a `+` / `−` / `~` badge. Accept renames the
  sidecar over the main file; Reject deletes the sidecar.
* From the terminal: `npx archik suggest show | accept | reject`.

If the user has no canvas open and asks "apply it", run
`npx archik suggest accept` for them (only after they've explicitly
asked).

**Key rules:**

* Write the *full proposed document*, not a patch. The diff is
  computed by archik between the main file and the sidecar.
* Don't call `Write`/`Edit` against `.archik/main.archik.suggested.yaml`
  or any peer file under `.archik/`. The CLI owns that directory.
* If a suggestion sidecar already exists, `npx archik suggest set`
  overwrites it. Tell the user you're replacing their previous
  pending suggestion.

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

The schema enforces these — `npx archik validate` will reject the file
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
- The path is resolved against the **project root** (parent of
  `.archik/` under the new layout, the doc's own directory under the
  legacy one) — same rule as `archikFile`. `npx archik validate` exits
  1 if the file isn't on disk.
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
- **Resolved against the project root**, not the file's own
  directory. With the new layout the project root is the parent of
  `.archik/`, so a sibling sub-file is `.archik/orders.archik.yaml`
  (with the prefix), NOT `orders.archik.yaml`. `npx archik validate`
  exits 1 if the target file isn't on disk — catch it there instead
  of as a 404 in the canvas.
- Cycles aren't checked at parse time (each file validates on its
  own); if you wire a loop the canvas just lets the user navigate
  in and out.

Conventional layout: keep sub-files under `.archik/` next to
`main.archik.yaml`, and reference them with the `.archik/` prefix:

```
.archik/main.archik.yaml          # entry point
.archik/orders.archik.yaml        # Orders service internals
.archik/payments.archik.yaml      # Payments service internals
```

```yaml
# in .archik/main.archik.yaml
nodes:
  - id: orders
    kind: service
    name: Orders
    archikFile: .archik/orders.archik.yaml   # ✅ project-root relative
    # archikFile: orders.archik.yaml         # ❌ validate fails
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

The CLI is the agent-friendly bridge to archik. Prefer it over
re-reading the YAML when answering structural questions — the answers
are deterministic, focused, and don't pollute your context with the
whole diagram.

### Running the CLI

The CLI ships as the `archik` npm package. Two equivalent ways to
invoke any command:

```
npx archik <command>      # works without installing — caches after first use
archik <command>          # if the user has run `npm i -g archik`
```

**Default to `npx archik` in your suggestions and shell calls.** It
just works in fresh repos, doesn't require a global install, and
falls through to the cached binary on subsequent runs. Suggest
`npm i -g archik` only when the user wants the live canvas
(`archik dev`) on a fast keystroke.

If neither form is reachable (offline, sandboxed shell), fall back to
reading the YAML directly with the same schema documented above —
the file is always the source of truth.

### Without a positional path

Every read command resolves the archik file in this order:
`.archik/main.archik.yaml` (preferred), then
`architecture.archik.yaml` (legacy). If both exist the command errors
and asks the user to pick one.

### Querying the diagram (use this for structural questions)

```
npx archik q describe <id>          # node + its incoming/outgoing edges
npx archik q deps <id>              # outgoing edges (what this node uses)
npx archik q dependents <id>        # incoming edges (what uses this node)
npx archik q list                   # all nodes
                  --kind <k>        #   filter by kind (service, function, …)
                  --parent <id>     #   filter by container
                  --file <p>        #   filter by file (substring match)
npx archik q edges                  # all edges
                  --from <id>       #   filter by source
                  --to <id>         #   filter by target
                  --rel <name>      #   filter by relationship
npx archik q impact <id>            # what would break if this node were removed
npx archik q stats                  # files, nodes, edges, kind histogram
```

Add `--json` to any `q` subcommand for a stable machine-readable
shape (object on stdout). Exit codes: `0` found, `1` empty / unknown
id, `2` could not load. Walks the root file plus every
`.archik/*.archik.yaml` sub-file. Cross-file id collisions error
rather than silently picking — surface the ambiguity.

### Authoring & lifecycle

```
npx archik validate                # schema + cross-file existence (CI-friendly, exit 1 on error)
npx archik validate --json         # structured { ok, file, nodes, edges, errors }
npx archik render --out diagram.svg
                  --theme light    # "dark" (default) or "light"
npx archik diff a.yaml b.yaml      # text summary
npx archik diff a.yaml b.yaml --out diff.svg
npx archik diff a.yaml b.yaml --json
npx archik suggest show            # summary of pending sidecar (default)
                  --json           #   structured output
npx archik suggest set <draft>     # validate a draft YAML and stage it as the sidecar
                  --note '<text>'  #   set metadata.suggestion.note
                  --main <path>    #   override main file detection
                  --json           #   structured output
                  -                #   draft path "-" reads from stdin
npx archik suggest accept          # apply the sidecar over the main file
npx archik suggest reject          # discard the sidecar
npx archik watch                   # re-render SVG on save
npx archik dev                     # open the live editor in the browser
npx archik start | stop | status   # detached canvas server lifecycle
npx archik init                    # scaffold a starter file + install skill + slash commands
npx archik skill                   # install/refresh the Claude skill in cwd
npx archik commands                # install/refresh the /archik:* slash commands in cwd
```

## Verification workflow

After **every** `npx archik suggest set` or `npx archik suggest
accept`:

1. The CLI has already validated the schema and cross-file references
   for you — `set` refuses to write a broken sidecar, `accept` runs
   over a sidecar that was validated when it was staged. If `set`
   reported errors, fix them in the temp draft and re-run; never
   reach for `Write`/`Edit` on the sidecar.
2. If the project has an `archik dev` server running, the file
   watcher broadcasts the change to the canvas automatically — no
   restart needed. Surface the URL so the user can click through.
3. If the project commits a rendered SVG (e.g.
   `docs/architecture.svg`), regenerate it with `npx archik render
   --out docs/architecture.svg` so the committed picture matches the
   YAML.

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
