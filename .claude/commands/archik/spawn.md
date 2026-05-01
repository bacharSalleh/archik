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

3. **Lock in the schema.** Run this before drafting any YAML —
   the prose below describes the workflow, not the field shapes.
   The CLI is the schema:
   ```
   npx archik schema
   ```
   Pay attention to which fields are arrays vs strings, and that
   every edge requires an `id` (kebab-case). Authoring from
   intuition produces predictable validation errors.

4. **Map the source tree.** Walk the project from cwd, paying
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

5. **Choose the kind for each node.** Default: `service`. Use the
   taxonomy from the skill — `function` for serverless, `worker`
   for background consumers, `agent` for LLM-driven agents, etc.
   When unsure, pick the closest fit and add a `notes:` entry
   explaining the inference rather than picking `custom`.

6. **Attach `sourcePath` to every code-bearing node.** This is
   non-negotiable in a normal/suggested file — the validator rejects
   any `service`, `function`, `worker`, `module`, `page`, `component`,
   `store`, or `hook` without a `sourcePath` that points at an
   existing file or directory. The whole point of `spawn` is "mirror
   the source tree", so the path you used to discover the node is
   exactly what goes into `sourcePath:`. Verify each path with `ls`
   before authoring; do not paste a path you haven't seen on disk.

   ```yaml
   - id: orders-api
     kind: service
     name: Orders API
     stack: Fastify
     sourcePath: services/orders/api   # must exist on disk
   ```

   For non-code-bearing kinds (`external`, `database`, `queue`,
   `cloud`, etc.) `sourcePath` is optional — they typically map to
   third-party systems or infra rather than checked-in files.

7. **Nest by structure**, mirroring the directories.
   - Top-level grouping dir (e.g. `services/`) → a `module` container.
   - Each child dir → a node with `parentId` pointing at the container.
   - If a node has substantial internal structure (e.g.
     `services/orders/{api,domain,db}`), emit a stub
     `archikFile: .archik/<id>.archik.yaml` and *also* draft that
     sub-file. Don't nest beyond two levels in the main file —
     drill-down is what `archikFile` is for.

8. **Wire the edges.** Be conservative — only add an edge when you
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

9. **Stage the draft.** Pipe the YAML straight into `npx archik
   suggest set -` via a heredoc — no temp files, no `/tmp/` paths.
   Sub-files come first because the main draft references them via
   `archikFile`, and `suggest set` validates that those targets
   exist on disk.

   a. **Each sub-file**: the parent file doesn't exist yet, so
      pass `--allow-orphan` to opt in to writing a sidecar for a
      missing main. Then accept it so the file lands at
      `.archik/<id>.archik.yaml`:
      ```bash
      npx archik suggest set --main .archik/<id>.archik.yaml \
                             --allow-orphan \
                             --note "spawn: <id> internals" - <<'YAML'
      version: "1.0"
      name: <Id> Internals
      nodes: [ ... ]
      edges: [ ... ]
      YAML
      # mechanical: puts sub-file on disk so the main draft's
      # archikFile: pointer validates. NOT the user's review gate
      # on the main draft — that one is always left as a sidecar.
      npx archik suggest accept .archik/<id>.archik.yaml
      ```
      Repeat for every sub-file. The `accept` step is what makes
      the file real on disk — without it the orphan sidecar lingers
      and the canvas shows it as "(pending)" rather than rendering it.

      **Narrate each auto-accept with its rationale**, not just
      "accept each". The user must be able to tell from your status
      line that you are NOT bypassing their `/archik:accept` review
      on the main draft. Example narration:

      > Auto-accepting `agent` sub-file so the main draft can
      > reference it via `archikFile:` — the next `suggest set`
      > would fail validation otherwise. The main draft will still
      > be left as a sidecar for you to review.

      The main draft (step 8b) is always left as a sidecar.
      `/archik:accept` is the user's gate; `npx archik suggest
      accept <sub-file>` here is mechanical plumbing for the
      cross-file reference, not a substitute for that gate.

   b. **Main draft**: once all sub-files exist (i.e. their
      `accept`s succeeded), stage the main one. No `--allow-orphan`
      needed because the main file already exists from `archik init`:
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

10. **Tell the user how to review and what's next.** Surface the
   canvas URL plus the natural follow-up:
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
