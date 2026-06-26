<p align="center">
  <img src="https://cdn.jsdelivr.net/npm/archik/docs/logo.svg" alt="archik" width="120">
</p>

<h1 align="center">archik</h1>

<p align="center">
  <em>Architecture-as-code in plain YAML — validated in CI, rendered in the browser, and read directly by your AI editor.</em>
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
  <img src="https://cdn.jsdelivr.net/npm/archik/docs/hero.svg?v=2" alt="Sample archik diagram" width="780">
</p>

---

## What is archik?

Your architecture lives in **plain YAML**. You edit it through a **CLI**, a **validator** rejects drift before it merges, and a **live canvas** renders it in the browser. AI agents — Claude Code, or anything that speaks MCP — read the same YAML as the map of your system, so they reason about structure instead of guessing from filenames.

One chain runs from a stakeholder request to a passing test, and every link is checked mechanically:

```
Actor → Use case → Slice → Tests → Sequence diagram → Nodes → Source
```

Nothing in that chain can quietly fall out of sync with the code.

## Install

Requires **Node.js ≥ 20**.

```bash
npx archik@latest init
```

`init` scaffolds `.archik/main.archik.yaml` and installs the Claude Code skill and `/archik:*` slash commands. As a Claude Code plugin instead:

```
/plugin marketplace add bacharSalleh/archik
/plugin install archik@archik
```

Both paths install the same skill and commands and use the `archik` npm binary, so Node is required either way.

## Quick start

```bash
npx archik init     # scaffold
npx archik start    # live canvas at http://localhost:5173
```

Then, in Claude Code, start every project with:

```
/archik:bootstrap   # detects project state, routes to the next step
```

Day to day:

| You type | You get |
| --- | --- |
| `/archik:suggest <feature>` | A staged diagram change, shown as a green/red diff on the canvas — accept or reject |
| `/archik:usecase <name>` | A use case with flows, slices, and test paths |
| `/archik:trace` | The coverage matrix — "are we done?" |

Already have docker-compose or Mermaid? Bootstrap from it instead of a blank canvas:

```bash
npx archik import compose --out .archik/main.archik.yaml
npx archik import mermaid docs/architecture.mmd --out .archik/main.archik.yaml
```

Compose services become nodes (`postgres` → `database`, `kafka` → `stream`, …), build contexts become `sourcePath`s, and `depends_on` becomes edges.

## The model

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

There are no coordinates — layout is computed by [ELK](https://eclipse.dev/elk/) on every render, so diffs stay meaningful. Each concern is a separate file, cross-checked by the validator:

| Layer | File | Captures |
| --- | --- | --- |
| Structure | `.archik/main.archik.yaml` | Services, databases, queues, agents, LLMs, edges |
| Actors | `*.archik.actors.yaml` | Who initiates use cases |
| Requirements | `.archik/usecases/*.archik.uc.yaml` | Flows and slices that name **test paths** |
| Behaviour | `*.archik.seq.yaml` | UML-subset sequence diagrams |
| Progress | `*.archik.alphas.yaml` | Essence/SEMAT alphas, machine-verified |

Full schema: `npx archik schema` (also `schema seq | uc | actors`).

## Keeping the model honest

A set of commands prove the diagram still matches reality, at every altitude:

```bash
npx archik validate            # schema + cross-file integrity + governance constraints
npx archik drift               # nodes/tests vs the source tree
npx archik drift --edges       # edges vs the TS/JS import graph (shadow + phantom edges)
npx archik affected --since main --run   # changed files → nodes → slices → run their tests
npx archik trace --fail-on partial       # coverage matrix; gate CI on incomplete traceability
npx archik otel check --graph deps.json  # edges vs a production service-dependency graph
```

`validate` proves the model is internally consistent, `drift` that it matches the code, and `otel check` that it matches production traffic. Gate every commit locally:

```bash
npx archik hooks install       # pre-commit: archik validate
```

Large models stay readable: `archik complexity` flags over-large files, hub nodes, and deep nesting with a concrete fix for each, and `archik q neighbors <id>` / `archik render --focus <id>` show one node's neighbourhood instead of the whole map.

## AI integration

**Claude Code.** `archik init` installs a skill that enforces one rule — *Claude talks to archik only through the CLI*, never by editing YAML directly. Reads go through `archik q`, writes through `archik suggest set`, and you approve every structural change on the canvas.

**Everything else (MCP).** `archik mcp` runs a stdio [Model Context Protocol](https://modelcontextprotocol.io) server exposing the same contract — tools for schema, queries, trace, validate, drift, and the suggestion lifecycle, plus resources (`archik://schema`, `archik://stats`, `archik://trace`) and prompts that encode the same loop:

```jsonc
// .cursor/mcp.json, claude_desktop_config.json, etc.
{
  "mcpServers": {
    "archik": { "command": "npx", "args": ["archik", "mcp"] }
  }
}
```

## Teams and governance

- **Semantic merges.** Nodes and edges are id-keyed, so most YAML merges are mechanical instead of line-based conflicts: `archik merge-driver --install`.
- **Ownership.** `owner:` on a node answers "who do I talk to" (`archik q list --owner team-billing`), and `archik owners sync` writes one CODEOWNERS rule per owned node into a managed block.
- **Governance constraints.** Architecture fitness rules enforced by `archik validate`:

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

Run the commands directly, or use the GitHub Action, which validates, checks drift and traceability, and posts a sticky PR comment with the architecture diff against the base branch:

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
          trace-fail-on: partial   # optional gate; omit for report-only
```

Inputs: `path`, `working-directory`, `validate`, `drift`, `trace-fail-on`, `compare-ref`, `comment`, `github-token`, `version`.

## Self-evolution

Opt-in, local-only, and human-gated: `archik evolution` observes how you use it (accepts, rejects, validate/drift runs), turns recurring friction into proposals you review, and records approved lessons in `.archik/evolution/learned.md` — which the Claude skill reads at session start, so the AI improves across sessions without anyone editing prompts. The same designs ship as a reusable library via `archik patterns`. See [docs/advanced-topics](./docs/advanced-topics/README.md).

## CLI reference

Every command supports `--help`; agent-facing commands support `--json`.

| Command | What it does |
| --- | --- |
| `archik init` | Scaffold + install the Claude skill and slash commands |
| `archik dev` / `start` / `stop` / `status` | Live canvas lifecycle (foreground / detached) |
| `archik validate [path]` | Schema + cross-file + constraints (exit 1 on error) |
| `archik complexity [path]` | Flag over-large files, hub nodes, deep nesting (`--fail-on-warn` to gate) |
| `archik render --out <svg>` | Headless SVG render (`--seq <path>`, `--focus <id>`, `--hide-structural`) |
| `archik watch` | Re-render SVG on every change |
| `archik q <sub>` | Query: `describe` `deps` `dependents` `neighbors` `impact` `list` `edges` `stats` `usecases` `describe-usecase` `actors` `sequences` |
| `archik diff <a> [b]` | Diff two files **or git refs**; one arg = that ref vs working tree |
| `archik affected` | Changed files → nodes, slices, tests (`--since <ref>`, `--files`, `--run`) |
| `archik trace` | Coverage matrix (`--fail-on partial\|none` for CI) |
| `archik drift` | sourcePath / test-path gaps (`--edges` verifies edges vs the import graph) |
| `archik otel check --graph <f>` | Verify edges against a production service-dependency graph |
| `archik suggest <sub>` | Suggestion sidecar lifecycle: `show` `set` `accept` `reject` |
| `archik alpha <sub>` | Essence alphas: `show`, `promote`, `demote` |
| `archik evolution <sub>` | Self-evolution loop: `enable` `reflect` `proposals` `approve` `reject` `report` |
| `archik patterns <sub>` | Pattern library: `list` `show <id>` `apply <id>` |
| `archik import compose\|mermaid [file]` | Bootstrap from docker-compose or a Mermaid flowchart |
| `archik merge-driver --install` | Semantic git merge for `*.archik.yaml` |
| `archik hooks install` | Pre-commit hook running `archik validate` (`--with-drift` optional) |
| `archik owners sync\|check` | Keep CODEOWNERS in step with node owners |
| `archik mcp` | MCP server over stdio for non-Claude-Code agents |
| `archik schema [seq\|uc\|actors]` | Print the document schemas |
| `archik upgrade` | Upgrade + refresh installed skill/commands |

Default file resolution: `.archik/main.archik.yaml`, falling back to the legacy `architecture.archik.yaml` (both present is an error).

## When to use it

Reach for archik when a project has more than a handful of components, ships with an AI agent you want reasoning about structure, needs "are we done?" to be mechanically answerable, or wants CI to fail on architectural drift. Skip it for one-file scripts, slide-deck diagrams (use Mermaid), or projects with no build or CI.

|  | archik | Mermaid / PlantUML | Structurizr |
| --- | --- | --- | --- |
| Source format | Plain YAML | Custom DSL | Structurizr DSL |
| AI-editor integration | **Skill + MCP** | None | None |
| Use cases / test traceability | **Mechanical** | No | No |
| Drift detection | **Yes** | No | No |
| Governance constraints | **Yes** | No | No |
| Validator | **Schema + cross-file + ECB** | Syntax only | Syntax only |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

```bash
npm install
npm run archik -- --help     # run the CLI from source
npm test                     # vitest
npm run typecheck
```

## License

MIT © [Bashar](https://github.com/bacharSalleh)
