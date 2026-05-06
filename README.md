<p align="center">
  <img src="https://cdn.jsdelivr.net/npm/archik/docs/logo.svg" alt="archik" width="120">
</p>

<h1 align="center">archik</h1>

<p align="center">
  <em>The shared vocabulary between you and Claude Code, at the engineering level.</em>
</p>

[![npm version](https://badge.fury.io/js/archik.svg)](https://www.npmjs.com/package/archik)
[![CI](https://github.com/bacharSalleh/archik/actions/workflows/ci.yml/badge.svg)](https://github.com/bacharSalleh/archik/actions/workflows/ci.yml)
[![GitHub Repo stars](https://img.shields.io/github/stars/bacharSalleh/archik)](https://github.com/bacharSalleh/archik/stargazers)
[![NPM Downloads](https://img.shields.io/npm/dm/archik)](https://www.npmjs.com/package/archik)
[![License](https://img.shields.io/npm/l/archik?color=blue)](./LICENSE)
[![Node](https://img.shields.io/node/v/archik?color=339933&logo=node.js&logoColor=white)](https://nodejs.org)
[![Twitter Follow](https://img.shields.io/twitter/follow/bach__92?style=social)](https://x.com/bach__92)

<p align="center">
  <img src="https://cdn.jsdelivr.net/npm/archik/docs/hero.svg?v=2" alt="Sample Archik diagram of an LLM-assisted support system" width="780">
</p>

archik gives your project — and the AI editing it — *one file* that
describes what the system actually looks like. Services, databases,
queues, agents, LLMs, the edges between them. Plain YAML, schema-
validated, no coordinates, no proprietary format.

Open it in your browser for a live canvas. Render it in CI for a
self-contained SVG. The [Claude Code skill and `/archik:*` slash
commands](#for-claude-code--other-llms) install automatically with
`archik init`, so the model edits the same file you do — *the
diagram and the codebase stop drifting because Claude treats the
diagram as the spec*.

If you've ever asked an AI agent "where would I add X?" and watched
it guess from filenames, archik is the fix: the YAML answers the
question, and Claude is required to read it before doing structural
work.

## Quickstart

Two terminal commands, then talk to Claude:

```bash
npx archik@latest init       # scaffolds .archik/main.archik.yaml +
                             # installs the Claude skill + /archik:* slash commands
npx archik@latest start      # opens the live canvas at http://localhost:5173
```

Then in Claude Code, type:

```
/archik:spawn               # mirror your real source tree as the first diagram
/archik:evolve              # propose a cleaner bounded-context refactor
/archik:suggest <feature>   # propose changes for a specific feature
```

Each `/archik:*` command stages a suggestion sidecar — **Review** in the canvas, then **Accept** or **Reject**. No manual YAML editing on either side: you click in the browser, Claude drives through the CLI.

Done with the canvas? `npx archik stop`.

<p align="center">
  <video src="https://github.com/bacharSalleh/archik/raw/main/docs/record.mp4" poster="https://cdn.jsdelivr.net/gh/bacharSalleh/archik@main/docs/archik.gif" width="780" controls muted autoplay loop playsinline>
    <img src="https://cdn.jsdelivr.net/gh/bacharSalleh/archik@main/docs/archik.gif" alt="Archik canvas demo" width="780">
  </video>
</p>

## What you write

```yaml
version: "1.0"
name: Support Hub
nodes:
  - id: api
    kind: service
    name: Support API
    stack: Go + Postgres
  - id: agent
    kind: agent
    name: Support Agent
    description: Drafts replies, escalates risky ones.
  - id: claude
    kind: llm
    name: Claude
edges:
  - id: api-agent
    from: api
    to: agent
    relationship: invokes
  - id: agent-claude
    from: agent
    to: claude
    relationship: invokes
    label: draft reply
```

No `x` / `y` / `width` — layout is computed by [ELK](https://eclipse.dev/elk/) on every render. The schema rejects coordinates so diffs stay meaningful.

## What it gives you

- **Live canvas** — `archik dev` (foreground) or `archik start` / `stop` (detached, multi-project).
- **27 node kinds** across compute, data, messaging, networking, hexagonal, AI/ML, identity, observability, cloud, UI, and external.
- **12 relationships** with distinct visual styling — `http_call`, `invokes`, `reads`, `writes`, `publishes`, `subscribes`, `streams_to`, `routes_to`, `implements`, `depends_on`, `has_a`, `uses`.
- **Drag-to-connect, multi-select, undo/redo, compact view, themed (dark / light), notes per node, color overrides on edges.**
- **CI-ready CLI** — `validate`, `render` (headless SVG), `watch`, `drift` (source-tree gaps), `trace` (coverage matrix with `--fail-on partial|none`).
- **AI skill + slash commands** — `archik init` installs both automatically. Eleven `/archik:*` commands cover the structural surface (`spawn`, `evolve`, `suggest`, `describe`, `dev`, `accept`, `reject`) plus the requirements layer (`actor`, `usecase`, `trace`, `alpha`).

## Beyond the diagram — use cases, traceability, alphas

The structural diagram is the start. Above it sits a thin requirements
layer that closes the Jacobson chain — *who acts → what they want →
how the system behaves at runtime → which structural nodes participate
→ which tests prove it*. Every link is a YAML cross-reference and the
validator rejects breaks at every step.

| Artifact                       | File                                | What it captures                                              |
| ------------------------------ | ----------------------------------- | ------------------------------------------------------------- |
| **Actors**                     | `*.archik.actors.yaml`              | Who initiates use cases — humans, external systems, schedulers |
| **Use cases + slices**         | `.archik/usecases/*.archik.uc.yaml` | What each actor wants, with slim slices that name test paths   |
| **Sequence diagrams**          | `*.archik.seq.yaml`                 | How a slice plays out at runtime (ECB-checked when bound to a slice via `realizes`) |
| **Alphas (Essence / SEMAT)**   | `*.archik.alphas.yaml`              | Project-wide progress dials with mechanically-verified states  |

`npx archik trace` prints the coverage matrix (use case × slice × test
× seq × ECB) so "are we done?" stops being an opinion. The dev canvas
surfaces the same information visually: the **Use cases** toolbar
button shows live trace status (`✓ all traced` / `◐ N to finish` /
`○ N untraced`), and `/__archik/usecases` is a dedicated page with
master/detail rail, slice cards with clickable test paths, and direct
links to each realising sequence diagram.

The `validate` command enforces the integrity triangle: if a slice
points at a seq file, the seq must point back; if a seq diagram
realises a slice, every participant node must list that seq in its
`seqFiles` array. Orphans get caught at lint time, not in code review.

## For Claude Code & other LLMs

The whole reason archik uses YAML instead of a binary format: **the file is the shared map between you and the model**. `npx archik@latest init` drops both the Claude skill and the seven slash commands into your project — no separate setup.

The skill enforces a hard rule: **Claude talks to archik only through the `npx archik` CLI** — never `Read`, `Write`, or `Edit` on a YAML directly. Queries go through `npx archik q`, suggestions through `npx archik suggest set`, lifecycle through `npx archik suggest accept | reject`. You own the file; the CLI is the contract.

### The slash commands

**Structural diagram (the original surface):**

| Command                     | What it does                                                |
| --------------------------- | ----------------------------------------------------------- |
| `/archik:spawn`             | Bootstrap a diagram by mirroring your real source tree      |
| `/archik:evolve`            | Propose a cleaner bounded-context refactor                  |
| `/archik:suggest <feature>` | Propose changes for a specific feature                      |
| `/archik:describe <id>`     | Explain a node and its connections                          |
| `/archik:dev`               | Open the live canvas                                        |
| `/archik:accept`            | Apply the pending suggestion                                |
| `/archik:reject`            | Discard the pending suggestion                              |

**Requirements + traceability (the Jacobson layer — see below):**

| Command                              | What it does                                                                |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `/archik:actor <id>`                 | Add or update an actor in the actor index                                   |
| `/archik:usecase <name>`             | Author a use case (actors + flows + slices + tests)                         |
| `/archik:trace`                      | Show the use case × slice × test × seq × ECB coverage matrix                |
| `/archik:alpha [show \| promote …]`  | Read the project's alpha state, or promote one with a criteria check        |

A typical first-day flow:

```
/archik:spawn                     # mirror what's there now
                                  #   → review on the canvas, accept
/archik:evolve                    # propose a cleaner shape
                                  #   → discuss with Claude, accept (or iterate)
/archik:suggest add Stripe webhook handler
                                  #   → small, targeted change
```

Each command stages a sidecar via `npx archik suggest set`. The canvas shows a green/red/amber diff overlay; you click Accept or Reject — or `/archik:accept` / `/archik:reject` from the terminal. Same outcome either way.

### Manual install (existing projects without `archik init`)

If you already have an archik file and just want to add the Claude integration:

```bash
npx archik@latest skill --user        # install skill into ~/.claude/skills (all projects)
npx archik@latest commands --user     # install /archik:* into ~/.claude/commands (all projects)
```

Drop the `--user` flag to scope to the current project only.

## Commands

```
archik init [path]       Scaffold a starter .archik/main.archik.yaml
                         (also installs the Claude skill + /archik:* slash commands by default)
                         --no-skill       skip installing the Claude skill
                         --no-commands    skip installing the /archik:* slash commands

archik dev [path]        Open the canvas in your browser (foreground, Ctrl+C to stop)
archik start [path]      Same as dev, but detached — prompt returns immediately
archik stop [path]       Stop the background server started with `archik start`
archik status            List running archik instances across all projects
                         (dev / start share these flags)
                         --port <n>       dev server port (default 5173)
                         --host <addr>    bind address (default 127.0.0.1)
                         --no-open        don't auto-open the browser

archik validate [path]   Validate against the schema (CI-friendly, exit code 1 on error)
archik render [path]     Render to a self-contained SVG file
                         --out <file>     output path (default: diagram.svg)
                         --theme <name>   "dark" (default) or "light"
archik watch [path]      Re-render to SVG on every file change (Ctrl+C to stop)

archik trace [path]      Use case × slice × test × seq × ECB coverage matrix
                         --json              structured rows + summary
                         --fail-on <level>   exit 1 on partial | none (CI gate)
                         --use-case <id>     filter to one use case
archik drift [path]      Surface gaps where a node's sourcePath or a slice's
                         tests path no longer resolves on disk

archik alpha [sub]       Project-wide alpha state (Essence / SEMAT)
                         show              snapshot with ✓ / ? / ✗ verification
                         promote <a> <s>   advance an alpha — runs criteria first;
                                           --note '<text>' captures the rationale
                         demote <a> <s>    walk back to an earlier state on the ladder

archik upgrade           Pull the latest archik via the project's package manager
                         (auto-detects npm / pnpm / yarn / bun from the lockfile)
                         then refreshes SKILL.md + slash commands from the new binary
                         --skip-install    just refresh artifacts; don't reinstall
                         --user            install to ~/.claude (global skill)

archik suggest [sub]     Manage Claude's pending architecture suggestion
                         show             summarise the pending sidecar (default; --json supported)
                         set <draft>      validate a draft YAML and stage it as the sidecar
                                          --note '<text>'  set metadata.suggestion.note
                                          --main <path>    override main file detection
                                          --json           structured output
                                          -                read draft from stdin
                         accept           apply the sidecar over the main file
                         reject           discard the sidecar

archik skill             Install the Claude skill for AI editing
                         --user           install into ~/.claude/skills (all projects)
                         --force          overwrite an existing skill
archik commands          Install the /archik:* slash commands for Claude Code
                         --user           install into ~/.claude/commands (all projects)
                         --force          overwrite existing commands
```

Without a `[path]` argument, archik resolves the file in this order:

1. `.archik/main.archik.yaml` (preferred new convention — keeps the project root tidy)
2. `architecture.archik.yaml` (legacy root location — still fully supported)

If both exist the command errors out and asks you to pick one. New projects get the `.archik/` layout from `archik init`; existing projects keep working without any migration.

Single instance per file is enforced via a lock file in `$TMPDIR/archik-cli/`, so parallel `dev` and `start` against the same YAML are rejected with a friendly error.

## Use it in CI

```bash
# Fail the build on schema errors
archik validate

# Generate a committable SVG of your architecture for the docs site
archik render --theme light --out docs/architecture.svg
```

## Schema

The full schema reference (every node kind, every relationship, common patterns, hard rules) lives in the AI skill. After installing it locally:

```bash
archik skill --user
$EDITOR ~/.claude/skills/archik/SKILL.md
```

Or read it directly in this repo: [`.claude/skills/archik/SKILL.md`](.claude/skills/archik/SKILL.md).

## Design notes

- The YAML is the only persistent truth. The canvas is a stateless projection that reloads on every file change (live-reload via SSE).
- Layout is non-negotiable: ELK lays out every render. Putting an `x` / `y` / `width` field at any level fails schema validation. No more "the diagram drifted because someone dragged a box."
- The published npm package ships only the bundled binary — no source files, no build tooling. Zero runtime dependencies.

## License

MIT © [Bashar](https://github.com/bacharSalleh)
