---
name: archik
description: Use whenever architecture.archik.yaml exists in the project, or the user asks about the system's architecture, services, dependencies, or data flow. The YAML is the shared map of the project between the user and Claude — read it before answering structural questions, and propose updates when work introduces or changes nodes/edges. Also covers the archik CLI for validation and rendering.
---

# Archik — the project's shared map

`architecture.archik.yaml` at the project root is **the user's source of
truth for what the system looks like**. It lists every meaningful node
(services, databases, queues, frontends, external APIs, …) and the
edges between them. The canvas in the browser is a stateless projection
of this file — when the user says "the orders service" or "the events
queue", they mean the entity with that `id` in the YAML.

Treat this file as a shared vocabulary. It exists so the user and you
can talk about the system without re-explaining it every time.

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
`architecture.archik.yaml` to capture that?"*

## When to defer

- Pure refactors that don't change the component graph → leave it alone.
- Local file moves / renames → leave it alone.
- Bug fixes inside an existing node → leave it alone.

The YAML tracks **shape**, not implementation detail.

## Hard rules for editing

- **Never put coordinates** (`x`, `y`, `width`, `height`, `viewport`) in
  the YAML. Layout is computed by ELK on every render. The schema
  rejects unknown keys at root, node, edge, and metadata levels.
- **Every id matches** `^[a-z][a-z0-9-]*$` — lowercase, starts with a
  letter, hyphens allowed.
- **Edges reference existing nodes**. If `from` or `to` doesn't match a
  node id, the document fails to load.
- **`parentId` references existing nodes** (typically `module` or
  `custom` containers).
- **Don't rename a node id**. Remove the old node and re-add it with
  the new id, then fix every edge that referenced it.
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
  metadata:             # optional, free record
    team: fulfillment
```

## Node kinds (26 total, grouped by purpose)

| Group       | Kinds |
| ----------- | --------------------------------- |
| Compute     | `service`, `function`, `worker`, `agent` |
| Data        | `database`, `cache`, `vectordb`, `storage` |
| Messaging   | `queue`, `topic`, `stream` |
| Networking  | `gateway`, `cdn` |
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

`module` and `custom` render as containers when they have children — set
`parentId` on the children to nest them inside.

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

## Relationships (12 total)

| Category       | Relationship | Visual |
| -------------- | ------------ | ------ |
| Sync calls     | `http_call`, `invokes`, `routes_to` | dotted, animated |
| Data access    | `reads`, `writes` | dotted, animated |
| Messaging      | `publishes`, `subscribes`, `streams_to` | dotted, animated |
| Architectural  | `implements`, `depends_on`, `has_a`, `uses` | static + muted |

Picking the right relationship:

- Service-to-service HTTP / RPC call → `http_call`
- Calling a function or agent → `invokes`
- Gateway routing requests → `routes_to`
- DB read query → `reads`
- DB write / mutation → `writes`
- Emitting an event / message → `publishes`
- Consuming an event / message → `subscribes`
- Continuous stream of records → `streams_to`
- Adapter implements an interface → `implements`
- A depends on B at the package / build level → `depends_on`
- Composition / ownership ("has a") → `has_a`
- Lighter-weight dependency → `uses`

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

## CLI

These commands are available globally if archik was installed via
`npm link`. Each defaults to `architecture.archik.yaml` in the current
directory unless given a positional path.

```
archik validate                    # schema check (run after every edit)
archik validate path/to/file.yaml
archik render --out diagram.svg    # headless layout → SVG
archik render --theme light --out diagram-light.svg
archik watch                       # re-render SVG on save
archik check                       # drift: nodes vs source dirs
archik dev                         # open the live editor in the browser
archik init                        # scaffold a starter file
archik skill                       # install/refresh this skill in cwd
```

If `archik` isn't on PATH (the user hasn't run `npm link` yet), fall
back to the in-repo form: `npm run archik -- <command>` from the
archik checkout.

## Verification workflow

After **every** edit you make to `architecture.archik.yaml`:

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
