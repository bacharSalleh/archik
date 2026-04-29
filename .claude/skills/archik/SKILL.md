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

When a user types `/archik:suggest`, `/archik:spawn`, or `/archik:evolve`, treat it as direct authorisation to run the sidecar workflow now — skip "want me to update the YAML?". Each command's body file under `.claude/commands/archik/` has the full protocol; follow it.

Distinction:
- **`spawn`** = descriptive (mirror the source tree as it is)
- **`evolve`** = prescriptive (propose a cleaner shape, then discuss before accepting)
- **`suggest`** = targeted (apply one feature-sized change from a description)

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

After a rejection, ask one clarifying question — *"Want me to try a smaller change that only touches X?"* — instead of going silent.

The goal: every accepted change ends with the user knowing what's next, not "ok, accepted".

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

npx archik q describe <id> | deps <id> | dependents <id>
                  list | edges | impact <id> | stats
                  --json                #   stable machine-readable shape

npx archik validate <path> [--json]     # schema + cross-file check (CI-friendly)
npx archik render --out diagram.svg --theme light|dark
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
