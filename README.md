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

```bash
npx archik init       # scaffolds .archik/main.archik.yaml AND installs the
                      # Claude skill + /archik:* slash commands by default
npx archik start      # canvas at http://localhost:5173 (background)
npx archik stop       # done
```

That's the whole onboarding. The canvas saves edits straight back to the YAML; the file is the truth, the canvas is a projection.

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
- **CI-ready CLI** — `validate`, `render` (headless SVG), `watch`, `check` (drift between YAML and source dirs).
- **AI skill + slash commands** — `archik skill --user` installs the Claude Code skill; `archik commands --user` installs `/archik:suggest`, `/archik:accept`, `/archik:reject`, `/archik:describe`, and `/archik:dev` so Claude drives the diagram entirely through the CLI.

## For Claude Code & other LLMs

The whole reason Archik uses YAML instead of a binary format: **the file is the shared map between you and the model**. Run:

```bash
archik skill --user        # install the skill into ~/.claude/skills
archik commands --user     # install the /archik:* slash commands into ~/.claude/commands
```

(Or just `archik init` in a fresh project — both land automatically.)

The skill enforces a hard rule: **Claude interacts with archik only through the `npx archik` CLI** — never `Read`, `Write`, or `Edit` on a YAML directly. Queries go through `npx archik q`, suggestions through `npx archik suggest set`, lifecycle through `npx archik suggest accept | reject`. The user owns the file; the CLI is the contract.

Day-to-day this looks like:

```
/archik:suggest add a payments worker that subscribes to the orders queue
```

Claude grounds itself with `npx archik q stats`, drafts a full proposal in a temp file, runs `npx archik suggest set` to stage it as the canonical sidecar, and surfaces the canvas URL so you can review the diff overlay and Accept/Reject in the browser. No manual YAML edits, no chance of the canvas and the file disagreeing.

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
