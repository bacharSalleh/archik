<p align="center">
  <img src="https://cdn.jsdelivr.net/npm/archik/docs/logo.svg" alt="archik" width="120">
</p>

<h1 align="center">archik</h1>

<p align="center">
  <em>Architecture-as-code your AI editor actually reads —<br/>
  with use cases, sequence diagrams, and tests wired end-to-end.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/archik"><img src="https://badge.fury.io/js/archik.svg" alt="npm version"></a>
  <a href="https://github.com/bacharSalleh/archik/actions/workflows/ci.yml"><img src="https://github.com/bacharSalleh/archik/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/bacharSalleh/archik/stargazers"><img src="https://img.shields.io/github/stars/bacharSalleh/archik" alt="GitHub stars"></a>
  <a href="https://www.npmjs.com/package/archik"><img src="https://img.shields.io/npm/dm/archik" alt="npm downloads"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/archik?color=blue" alt="license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/archik?color=339933&logo=node.js&logoColor=white" alt="node"></a>
</p>

<p align="center">
  <img src="https://cdn.jsdelivr.net/npm/archik/docs/hero.svg?v=2" alt="Sample Archik diagram" width="780">
</p>

---

## What is archik?

Your architecture lives in **plain YAML**. A **CLI** is the only way to edit it, a **validator** rejects every drift before merge, and a **live canvas** renders it in the browser. AI agents (Claude Code, or anything that speaks MCP) read the same YAML as their map of your system — so they reason about structure instead of guessing from filenames.

One chain runs from a stakeholder request all the way to a passing test, and every link is mechanically checked:

```
Actor → Use case → Slice → Tests on disk → Seq diagram → Nodes → Source code on disk
```

## Features

- 📐 **Plain-YAML diagrams** — no DSL, no coordinates; layout is computed by [ELK](https://eclipse.dev/elk/) on every render, so diffs stay meaningful
- 🖥️ **Live canvas** — `archik dev` opens a browser canvas that reloads on every file change; headless SVG render for docs and CI
- 🤖 **AI-native** — installable Claude Code skill + 12 slash commands, and an MCP server for Cursor, Windsurf, Copilot, Claude Desktop, Zed
- ✅ **Validator, not convention** — schema, cross-file references, `sourcePath` existence, use-case/actor/seq integrity, ECB rules
- 🔍 **Traceability** — `archik trace` proves which use case slices are tested and realized; `--fail-on` gates CI
- 🌿 **Git-aware** — `archik diff origin/main` shows what a branch changes architecturally; `archik affected` maps changed files to nodes, slices, and tests
- 🤝 **Team-ready** — semantic merge driver for YAML, node ownership, and governance constraints (architecture fitness rules)
- 🚀 **Fast adoption** — `archik import compose` bootstraps a diagram from docker-compose; `/archik:spawn` mirrors an existing source tree
- 📦 **Zero runtime dependencies** in the published package

## Installation

Requires **Node.js ≥ 20**.

```bash
npx archik@latest init       # scaffolds .archik/main.archik.yaml
                             # + installs the Claude skill and /archik:* commands
```

Or as a Claude Code plugin:

```
/plugin marketplace add bacharSalleh/archik
/plugin install archik@archik
```

Both paths install the same skill and slash commands. The plugin still uses the `archik` npm binary, so Node is needed either way.

## Quick start

```bash
npx archik init              # 1. scaffold
npx archik start             # 2. open the live canvas (http://localhost:5173)
```

Then, in Claude Code:

```
/archik:bootstrap            # 3. always your first message — detects project
                             #    state and routes to the right next step
```

Day-to-day:

| You type | You get |
| --- | --- |
| `/archik:suggest <feature>` | A staged diagram change, shown as a green/red diff overlay on the canvas — accept or reject |
| `/archik:usecase <name>` | A use case with flows, slices, and test paths |
| `/archik:trace` | "Are we done?" — the coverage matrix |

**Already containerised?** Skip the blank canvas:

```bash
npx archik import compose --out .archik/main.archik.yaml
```

Compose services become nodes (postgres → `database`, redis → `cache`, kafka → `stream`, …), build contexts become `sourcePath`s, and `depends_on` becomes edges.

## The YAML

```yaml
version: "1.0"
name: Support Hub
nodes:
  - id: api
    kind: service
    name: Support API
    sourcePath: src/api          # must exist on disk — validator-enforced
    description: REST API serving the customer support frontend.
    owner: team-support          # optional — who to talk to
  - id: claude
    kind: llm
    name: Claude
    description: LLM backend for draft generation.
edges:
  - id: api-claude
    from: api
    to: claude
    relationship: invokes
```

One file per layer, every link cross-checked by the validator:

| Layer | File | Captures |
| --- | --- | --- |
| Structure | `.archik/main.archik.yaml` | Services, databases, queues, agents, LLMs, edges |
| Actors | `*.archik.actors.yaml` | Who initiates use cases |
| Requirements | `.archik/usecases/*.archik.uc.yaml` | Flows + slices that name **test paths** |
| Behaviour | `*.archik.seq.yaml` | UML-subset sequence diagrams |
| Progress | `*.archik.alphas.yaml` | Essence/SEMAT alphas, machine-verified |

Full schema: `npx archik schema` (also `schema seq | uc | actors`).

## Everyday workflow

```bash
# What am I touching on this branch? Which tests cover it?
npx archik affected --since main

# What does this branch change architecturally?
npx archik diff origin/main            # add --out diff.svg for the visual

# Is the diagram still telling the truth?
npx archik validate && npx archik drift

# Are we done?
npx archik trace
```

`affected` walks the chain backwards: changed files → nodes (via `sourcePath`) → use case slices (via tests and sequence-diagram participants) → tests to run — and flags changed files no node or test claims.

## AI integration

**Claude Code** (deepest integration): `archik init` installs a skill that enforces one hard rule — *Claude talks to archik only through the CLI*, never by editing YAML directly. Reads go through `archik q`, writes through `archik suggest set`, and you approve every structural change on the canvas.

**Everything else** (MCP): `archik mcp` runs a stdio [Model Context Protocol](https://modelcontextprotocol.io) server exposing the same contract — 20 tools covering schema, queries, trace, validate, drift, affected, and the suggestion lifecycle:

```jsonc
// .cursor/mcp.json, claude_desktop_config.json, etc.
{
  "mcpServers": {
    "archik": { "command": "npx", "args": ["archik", "mcp"] }
  }
}
```

## Team workflow

**Semantic merges.** Stop resolving line-based YAML conflicts — nodes and edges are id-keyed, so most merges are mechanical:

```bash
npx archik merge-driver --install    # once per clone; .gitattributes line is committed
```

Both branches added nodes → keep both. One side changed a field → take it. Same field changed differently, or modify-vs-delete → a real conflict, reported precisely.

**Ownership.** `owner: team-billing` on a node answers "who do I talk to": `archik q describe payments-db`, `archik q list --owner team-billing`.

**Governance constraints.** Architecture fitness rules, enforced by `archik validate` on every run:

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
```

Intentional exceptions are grandfathered by id in an `except` list — visible in review, never silent.

## CI

Plain commands:

```bash
archik validate                        # schema + cross-file integrity + constraints
archik drift                           # diagram vs source tree
archik trace --fail-on partial         # block merge on incomplete traceability
archik render --theme light --out docs/architecture.svg
```

Or the GitHub Action, which runs all three and posts a sticky PR comment with the architecture diff vs the base branch:

```yaml
# .github/workflows/archik.yml
name: archik
on: [pull_request]
permissions:
  contents: read
  pull-requests: write
jobs:
  archik:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bacharSalleh/archik@main
        with:
          trace-fail-on: partial       # optional gate; omit for report-only
```

Inputs: `path`, `working-directory`, `validate`, `drift`, `trace-fail-on`, `compare-ref`, `comment`, `github-token`, `version`.

## CLI reference

Every command supports `--help`; agent-facing commands support `--json`.

| Command | What it does |
| --- | --- |
| `archik init` | Scaffold + install the Claude skill and slash commands |
| `archik dev` / `start` / `stop` / `status` | Live canvas lifecycle (foreground / detached) |
| `archik validate [path]` | Schema + cross-file + constraints (exit 1 on error) |
| `archik render --out <svg>` | Headless SVG render (`--seq <path>` for sequence diagrams) |
| `archik watch` | Re-render SVG on every change |
| `archik q <sub>` | Query: `describe` `deps` `dependents` `impact` `list` `edges` `stats` `usecases` `describe-usecase` `actors` `sequences` |
| `archik diff <a> [b]` | Diff two files **or git refs**; one arg = that ref vs working tree |
| `archik affected` | Changed files → nodes, slices, tests to run (`--since <ref>`, `--files`) |
| `archik trace` | Coverage matrix (`--fail-on partial\|none` for CI) |
| `archik drift` | sourcePath / test-path gaps vs the source tree |
| `archik suggest <sub>` | Suggestion sidecar lifecycle: `show` `set` `accept` `reject` |
| `archik alpha <sub>` | Essence alphas: `show`, `promote` (machine-checked), `demote` |
| `archik import compose [file]` | Bootstrap a document from docker-compose |
| `archik merge-driver --install` | Semantic git merge for `*.archik.yaml` |
| `archik mcp` | MCP server over stdio for non-Claude-Code agents |
| `archik schema [seq\|uc\|actors]` | Print the document schemas |
| `archik upgrade` | Upgrade + refresh installed skill/commands |

Default file resolution: `.archik/main.archik.yaml`, falling back to the legacy `architecture.archik.yaml` (both present = error).

## When to use it (and when not to)

**Use archik when** your project has more than ~5 components, you ship with an AI agent and want it to reason about structure, you want "are we done?" to be mechanically answerable, or you want CI to fail on architectural drift.

**Skip it when** it's a one-file script, the diagram is for a slide deck (use Mermaid), or you have no build step or CI.

|  | archik | Mermaid / PlantUML | Structurizr |
| --- | --- | --- | --- |
| Source format | Plain YAML | Custom DSL | Structurizr DSL |
| AI-editor integration | **Skill + MCP** | None | None |
| Use cases / test traceability | **Mechanical** | No | No |
| Drift detection | **Yes** | No | No |
| Governance constraints | **Yes** | No | No |
| Validator | **Schema + cross-file + ECB** | Syntax only | Syntax only |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Development:

```bash
npm install
npm run archik -- --help     # run the CLI from source
npm test                     # vitest
npm run typecheck
```

## License

MIT © [Bashar](https://github.com/bacharSalleh)
