# Archik

> An architecture diagram tool where the file is the source of truth — and Claude can edit it alongside you.

<p align="center">
  <img src="https://cdn.jsdelivr.net/npm/archik/docs/hero.svg" alt="Sample Archik diagram of an LLM-assisted support system" width="780">
</p>

You write a small YAML file describing your nodes (services, databases, queues, agents, LLMs, …) and the edges between them. Archik gives you a live browser canvas, a CLI for CI, and an installable AI skill so Claude Code understands your architecture file the same way you do — no proprietary format, no coordinates in the YAML, no manual layout.

## Quickstart

```bash
npx archik init       # scaffold architecture.archik.yaml in cwd
npx archik start      # canvas at http://localhost:5173 (background)
npx archik stop       # done
```

That's the whole onboarding. The canvas saves edits straight back to the YAML; the file is the truth, the canvas is a projection.

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
- **26 node kinds** across compute, data, messaging, hexagonal, AI/ML, identity, observability, cloud, UI, and external.
- **12 relationships** with distinct visual styling — `http_call`, `invokes`, `reads`, `writes`, `publishes`, `subscribes`, `streams_to`, `routes_to`, `implements`, `depends_on`, `has_a`, `uses`.
- **Drag-to-connect, multi-select, undo/redo, compact view, themed (dark / light), notes per node, color overrides on edges.**
- **CI-ready CLI** — `validate`, `render` (headless SVG), `watch`, `check` (drift between YAML and source dirs).
- **AI skill** — `archik skill --user` installs a Claude Code skill that teaches Claude the schema, the protocol, and the verification workflow.

## For Claude Code & other LLMs

The whole reason Archik uses YAML instead of a binary format: **the file is the shared map between you and the model**. Run:

```bash
archik skill --user        # install once into ~/.claude/skills
```

…and Claude Code in any project gets the right vocabulary automatically. The skill defines a 3-rule protocol:

1. **Read** `architecture.archik.yaml` before answering structural questions.
2. **Propose** YAML updates whenever new work introduces or rewires components.
3. **Run `archik validate`** after every edit to fail fast on schema errors.

So conversations like *"add a payments worker that subscribes to the orders queue"* end with both the code change **and** the matching YAML diff — kept in sync without anyone having to remember.

## Commands

```
archik init [path]       Scaffold a starter architecture.archik.yaml
                         --skill          also install the Claude skill into ./.claude/skills

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
archik check [path]      Drift detection — flag nodes without matching source dirs

archik skill             Install the Claude skill for AI editing
                         --user           install into ~/.claude/skills (all projects)
                         --force          overwrite an existing skill
```

Default path is `architecture.archik.yaml` in the current directory. Single instance per file is enforced via a lock file in `$TMPDIR/archik-cli/`, so parallel `dev` and `start` against the same YAML are rejected with a friendly error.

## Use it in CI

```bash
# Fail the build on schema errors
archik validate

# Generate a committable SVG of your architecture for the docs site
archik render --theme light --out docs/architecture.svg

# Warn when nodes don't have a matching source folder under src/, services/, packages/, or apps/
archik check
```

## Schema

The full schema reference (every node kind, every relationship, common patterns, hard rules) lives in the AI skill. After installing it locally:

```bash
archik skill --user
$EDITOR ~/.claude/skills/archik.md
```

Or read it directly in this repo: [`.claude/skills/archik.md`](.claude/skills/archik.md).

## Design notes

- The YAML is the only persistent truth. The canvas is a stateless projection that reloads on every file change (live-reload via SSE).
- Layout is non-negotiable: ELK lays out every render. Putting an `x` / `y` / `width` field at any level fails schema validation. No more "the diagram drifted because someone dragged a box."
- The published npm package ships only the bundled binary — no source files, no build tooling. Zero runtime dependencies.

## License

MIT © [Bashar](https://github.com/bacharSalleh)
