---
description: Mirror the source tree as a diagram
---

# /archik:spawn — mirror the codebase as an archik diagram

The user wants a first-pass archik diagram that **reflects the
project as it actually is right now**, not as it should be. Read
the source tree, infer the components and the wiring, stage the
result as a suggestion sidecar so the user can review it on the
canvas before accepting.

Use `/archik:evolve` afterwards if they want a cleaner version.
Spawn = mirror. Evolve = improve.

## CLI-only — do not touch archik files directly

You MUST interact with archik exclusively through the `npx archik`
CLI. Do NOT use `Read`, `Write`, or `Edit` on any file under
`.archik/`. Your draft goes to a workspace temp file, then `npx
archik suggest set` stages it.

## Steps

1. **Make sure the canvas is running** so the user can review:
   ```
   npx archik status
   ```
   If nothing is running, start it detached: `npx archik start`.
   Note the URL.

2. **Check what's already there** — if the project already has a
   meaningful archik file, this command will *replace* it via the
   suggestion workflow. Confirm with the user before proceeding
   when the diagram has substance:
   ```
   npx archik q stats
   ```
   - 0 nodes / starter scaffold (web + api + db, the `archik init`
     default) → proceed silently.
   - Real content → tell the user "I'm about to replace the
     current diagram with a fresh one mirroring the source tree —
     this will produce a sidecar you can review or reject. Want me
     to continue?" Wait for confirmation.

3. **Map the source tree.** Walk the project from cwd, paying
   attention to conventional layouts. Don't recurse into
   `node_modules`, `dist`, `build`, `.git`, `.next`,
   `target`, `venv`, `.venv`, or `vendor`.

   Useful signals (apply only if they fit the project — never
   invent structure):
   - **Top-level dirs**: `apps/`, `services/`, `packages/`, `src/`,
     `cmd/`, `internal/`, `lambdas/`, `workers/`, `agents/`.
     Each child usually maps to one node.
   - **Manifest files**: `package.json` `name`, `Cargo.toml`,
     `go.mod`, `pyproject.toml` give canonical component names.
   - **`README` / `description`**: pull a one-line summary if
     present; otherwise omit `description` rather than fabricate.
   - **Stack hints**: `package.json` deps (Next.js, Express, Fastify,
     Hono → service/frontend), `go.mod`, `requirements.txt`,
     `Gemfile`. Set `stack` only when the signal is clear.
   - **Datastores**: a `migrations/` folder, a `schema.sql`,
     `prisma/`, `drizzle/`, `flyway/`, references to Postgres /
     MySQL / Redis / Mongo / S3 / Pinecone / pgvector in deps or
     env files → corresponding `database` / `cache` / `vectordb` /
     `storage` node.
   - **Queues / streams**: SQS / RabbitMQ / Kafka / Kinesis client
     deps or config → `queue` / `topic` / `stream` node.
   - **External APIs**: Stripe, OpenAI, Anthropic, Twilio, GitHub
     SDKs in deps → `external` (or `llm` for OpenAI / Anthropic)
     nodes.
   - **Frontends**: `apps/web`, `apps/mobile`, `client/`,
     `packages/ui` apps that ship a UI → `frontend`.

4. **Choose the kind for each node.** Default: `service`. Use the
   taxonomy from the skill — `function` for serverless, `worker`
   for background consumers, `agent` for LLM-driven agents, etc.
   When unsure, pick the closest fit and add a `notes:` entry
   explaining the inference rather than picking `custom`.

5. **Nest by structure**, mirroring the directories.
   - Top-level grouping dir (e.g. `services/`) → a `module` container.
   - Each child dir → a node with `parentId` pointing at the container.
   - If a node has substantial internal structure (e.g.
     `services/orders/{api,domain,db}`), emit a stub
     `archikFile: .archik/<id>.archik.yaml` and *also* draft that
     sub-file. Don't nest beyond two levels in the main file —
     drill-down is what `archikFile` is for.

6. **Wire the edges.** Be conservative — only add an edge when you
   have actual evidence:
   - Cross-package imports → `depends_on` or a more specific
     relationship (`uses`, `invokes`).
   - HTTP route handlers calling another service's endpoint →
     `http_call`.
   - DB client usage → `reads` / `writes`.
   - Queue producer / consumer code → `publishes` / `subscribes`.
   - Webhook handlers (e.g. `/webhooks/stripe`) → `webhook` from
     the external node.

   When in doubt, leave the edge out. The user will add it via
   `/archik:suggest` later.

7. **Stage the draft.** Pipe the YAML straight into `npx archik
   suggest set -` via a heredoc — no temp files, no `/tmp/` paths.
   For sub-files, do them first; the main draft references them
   via `archikFile`, so they need to exist on disk before the main
   draft validates.

   a. **Each sub-file**: stage with `suggest set -`, then accept
      it so the file lands at `.archik/<id>.archik.yaml`:
      ```bash
      npx archik suggest set --main .archik/<id>.archik.yaml \
                             --note "spawn: <id> internals" - <<'YAML'
      version: "1.0"
      name: <Id> Internals
      nodes: [ ... ]
      edges: [ ... ]
      YAML
      npx archik suggest accept .archik/<id>.archik.yaml
      ```
      Repeat for every sub-file you reference.

   b. **Main draft**: once all sub-files exist, stage the main one:
      ```bash
      npx archik suggest set --note "spawn: mirror source tree" - <<'YAML'
      version: "1.0"
      name: My Architecture
      nodes:
        # full proposed end-state, with archikFile pointers
      edges:
        # ...
      YAML
      ```

   c. If `suggest set` reports validation errors, re-run with the
      corrected YAML. Never edit the sidecar by hand.

8. **Tell the user how to review.** Surface the canvas URL plus:
   - "📝 Initial diagram staged from source tree — open the
     canvas at <URL> and use Review to see the proposed nodes."
   - "Looks wrong? Run `/archik:reject` and we'll iterate. Or run
     `/archik:evolve` after accepting if you want a cleaner
     bounded-context version."

## Notes

- Spawn is descriptive, not prescriptive. Don't reorganize, split,
  or merge components — just mirror what's there. Cleanup is
  `/archik:evolve`'s job.
- Don't fabricate edges to fill gaps in the diagram. An incomplete
  but accurate diagram is more useful than a complete-looking but
  wrong one.
- If the source tree is one big monolith with no obvious
  decomposition, output a single node and tell the user — don't
  invent fake sub-services.
