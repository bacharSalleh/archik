<p align="center">
  <img src="https://cdn.jsdelivr.net/npm/archik/docs/logo.svg" alt="archik" width="120">
</p>

<h1 align="center">archik</h1>

<p align="center">
  <em>Architecture-as-code your AI editor actually reads —<br/>
  with use cases, sequence diagrams, and tests wired end-to-end.</em>
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

## The problems this fixes

If you've ever:

- Asked an AI agent **"where would I add X?"** and watched it guess from filenames
- Shipped a feature and realised **the architecture doc hasn't been right since 2023**
- Tried to answer **"are we done?"** and gotten back vibes instead of evidence
- Watched a diagram drift from the code because **someone dragged a box and forgot to write it down**

…then you know the gap. archik closes it with one YAML file as the spec, a CLI that's the only way to edit it, and a validator that catches every drift before merge.

## What you get

| Layer                | File                                | What it captures                                                          |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------------- |
| **Structure**        | `.archik/main.archik.yaml`          | Services, databases, queues, agents, LLMs, the edges between them        |
| **Actors**           | `*.archik.actors.yaml`              | Who initiates use cases (humans, external systems, schedulers)           |
| **Requirements**     | `.archik/usecases/*.archik.uc.yaml` | What each actor wants — flows + slices that name **test paths**           |
| **Behaviour**        | `*.archik.seq.yaml`                 | UML-subset sequence diagrams, ECB-checked when bound to a slice           |
| **Progress**         | `*.archik.alphas.yaml`              | Essence/SEMAT alphas with **mechanically-verified** state transitions     |

Every link between layers is a YAML cross-reference. The validator rejects breaks at every step — slice with missing test files, seq diagram without a `realizes` block, node whose `sourcePath` no longer resolves on disk, participant node missing a `seqFiles` backref. Orphans are caught at lint time, not in code review.

## Quickstart

```bash
npx archik@latest init       # scaffolds .archik/main.archik.yaml +
                             # installs the Claude skill + /archik:* slash commands
npx archik@latest start      # opens the live canvas at http://localhost:5173
```

Then in Claude Code:

```
/archik:spawn                   # mirror your real source tree as the first diagram
/archik:suggest <feature>       # propose changes for a specific feature
/archik:usecase <name>          # author a use case with slices + tests
/archik:trace                   # "am I done?" — the coverage matrix
```

`/archik:suggest` and `/archik:usecase` stage reviewable artifacts — diff overlay on the canvas, accept or reject. **Claude never edits YAML by hand**; the skill enforces CLI-only access.

<p align="center">
  <video src="https://github.com/bacharSalleh/archik/raw/main/docs/record.mp4" poster="https://cdn.jsdelivr.net/gh/bacharSalleh/archik@main/docs/archik.gif" width="780" controls muted autoplay loop playsinline>
    <img src="https://cdn.jsdelivr.net/gh/bacharSalleh/archik@main/docs/archik.gif" alt="Archik canvas demo" width="780">
  </video>
</p>

## Two install paths, same outcome

**npm** — the canonical install, includes the CLI and the canvas:

```bash
npx archik@latest init
```

**Claude Code plugin** — for the marketplace flow:

```
/plugin marketplace add bacharSalleh/archik
/plugin install archik@archik
```

Either path lands the same skill + the same 11 slash commands. The plugin still uses the `archik` npm binary for the actual work, so you need Node available either way. See [Manual install](#manual-install) for adding the integration to projects that don't use `archik init`.

## What you write

```yaml
version: "1.0"
name: Support Hub
nodes:
  - id: api
    kind: service
    name: Support API
    sourcePath: src/api
    description: REST API serving the customer support frontend.
    stereotype: boundary
  - id: agent
    kind: agent
    name: Support Agent
    sourcePath: src/agent
    description: Drafts replies, escalates risky ones to a human.
    stereotype: control
  - id: claude
    kind: llm
    name: Claude
    description: LLM backend for draft generation.
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

No `x`/`y`/`width` — layout is computed by [ELK](https://eclipse.dev/elk/) on every render. The schema rejects coordinates so diffs stay meaningful and diagrams stop drifting because someone moved a box.

## The killer feature: the Jacobson chain

The diagram is the start. The thing that actually answers *"are we done?"* is the chain that runs from a stakeholder request all the way down to a passing test:

```
Actor → Use case → Slice → Tests on disk → Seq diagram → Participant nodes → sourcePath on disk
```

Every arrow is a YAML cross-reference. `npx archik trace` walks the chain and prints a coverage matrix:

```
$ npx archik trace

    USE CASE / SLICE                   TST  RZ ECB   FILE
~ drift/clean                        1t   —  —     .archik/usecases/drift.archik.uc.yaml
~ drift/missing-source               1t   —  —     .archik/usecases/drift.archik.uc.yaml
~ render/arch-svg                    1t   —  —     .archik/usecases/render.archik.uc.yaml
~ suggest-accept/happy               1t   ✓  2/4   .archik/usecases/suggest-accept.archik.uc.yaml
~ suggest-accept/rejected            1t   —  —     .archik/usecases/suggest-accept.archik.uc.yaml
~ validate/clean                     1t   —  —     .archik/usecases/validate.archik.uc.yaml

totals: 9 slices across 4 use cases — 0 full, 9 partial, 0 untraced
```

Same data lives on screen — the **Use cases** toolbar button shows live status (`✓ all traced` / `◐ N to finish` / `○ N untraced`), and `/__archik/usecases` is a dedicated page with master/detail rail, slice cards with test paths, and direct links to each realising sequence diagram.

In CI:

```bash
npx archik trace --fail-on partial    # exit 1 if anything's not fully traced
```

## In your workflow

**Adding a feature.** Type `/archik:suggest add Stripe webhook handler`. Claude grounds in the current diagram, asks 1–3 clarifying questions, and stages a sidecar with the proposed shape. You review the green/red diff overlay on the canvas. Accept and the YAML is updated atomically; the next step is the build plan.

**Tracking the work.** `/archik:usecase <name>` writes a `*.archik.uc.yaml` with flows, slices, and test paths. Each active slice's test files must exist on disk — the validator rejects empty promises. As code lands, slices flip from "tests-only" to "fully traced" once their realisation seq exists.

**Closing the milestone.** `/archik:trace` surfaces what's left. `/archik:alpha promote requirements addressed` runs the criteria check before advancing — over-claiming is a hard error. `npx archik drift` catches sourcePath gaps from the source tree side.

## How it differs

|                       | archik                | Mermaid / PlantUML | Structurizr      | ADRs               |
| --------------------- | --------------------- | ------------------ | ---------------- | ------------------ |
| Diagram source format | Plain YAML            | Custom DSL         | Structurizr DSL  | Markdown prose     |
| Layout                | Auto (ELK), no coords | Auto               | Auto             | N/A                |
| Live canvas           | Yes (browser)         | Some renderers     | Yes              | No                 |
| Headless render to CI | Yes (SVG)             | Yes                | Yes              | No                 |
| AI-editor integration | **First-class**       | None               | None             | None               |
| Use cases / slices    | **Yes**               | No                 | No               | Sometimes informal |
| Sequence diagrams     | **Yes (UML subset)**  | Yes                | No               | No                 |
| Test ↔ requirement traceability | **Mechanical**  | No                 | No               | No                 |
| Drift detection       | **Yes (`drift`)**     | No                 | No               | No                 |
| Validator             | **Schema + cross-file + ECB rules** | Syntax only | Syntax only | None             |

If all you need is a one-off rendered diagram, Mermaid is faster. If you need the diagram to **stay accurate across an LLM-assisted refactor** and **prove the system does what the requirements say**, that's archik.

## All slash commands

**Structural diagram** (the original surface):

| Command                     | What it does                                           |
| --------------------------- | ------------------------------------------------------ |
| `/archik:spawn`             | Bootstrap a diagram by mirroring your real source tree |
| `/archik:evolve`            | Propose a cleaner bounded-context refactor             |
| `/archik:suggest <feature>` | Propose changes for a specific feature                 |
| `/archik:describe <id>`     | Explain a node and its connections                     |
| `/archik:dev`               | Open the live canvas                                   |
| `/archik:accept`            | Apply the pending suggestion                           |
| `/archik:reject`            | Discard the pending suggestion                         |

**Requirements + traceability** (the Jacobson layer):

| Command                              | What it does                                                |
| ------------------------------------ | ----------------------------------------------------------- |
| `/archik:actor <id>`                 | Add or update an actor in the actor index                   |
| `/archik:usecase <name>`             | Author a use case (actors + flows + slices + tests)         |
| `/archik:trace`                      | Show the coverage matrix + the next concrete action         |
| `/archik:alpha [show \| promote …]`  | Read or move project alphas with a machine-checked criteria |

The skill enforces a hard rule: **Claude talks to archik only through `npx archik`** — never `Read`, `Write`, or `Edit` on a YAML file directly. Queries through `npx archik q`, suggestions through `npx archik suggest set`, lifecycle through `npx archik suggest accept | reject`. You own the file; the CLI is the contract.

## CLI reference

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
                         --seq <path>     render a sequence diagram instead of the structural one
archik watch [path]      Re-render to SVG on every file change (Ctrl+C to stop)

archik trace [path]      Use case × slice × test × seq × ECB coverage matrix
                         --json              structured rows + summary
                         --fail-on <level>   exit 1 on partial | none (CI gate)
                         --use-case <id>     filter to one use case
                         --actor <id>        filter to use cases involving an actor
                         --status <s>        filter slices by status (active|proposed|deprecated)
                         --coverage <l>      filter rows by level (full|partial|none)
archik drift [path]      Surface gaps where a node's sourcePath or a slice's
                         tests path no longer resolves on disk

archik alpha [sub]       Project-wide alpha state (Essence / SEMAT)
                         show              snapshot with ✓ / ? / ✗ verification
                         promote <a> <s>   advance an alpha — runs criteria first;
                                           --note '<text>' captures the rationale
                         demote <a> <s>    walk back to an earlier state on the ladder

archik suggest [sub]     Manage Claude's pending architecture suggestion
                         show             summarise the pending sidecar (default; --json supported)
                         set <draft>      validate a draft YAML and stage it as the sidecar
                                          --note '<text>'  set metadata.suggestion.note
                                          --main <path>    override main file detection
                                          --json           structured output
                                          -                read draft from stdin
                         accept           apply the sidecar over the main file
                         reject           discard the sidecar

archik q [sub]           Query the diagram (--json supported on every subcommand)
                         describe <id>    one node, full detail
                         deps <id>        what does this node depend on?
                         dependents <id>  what depends on this node?
                         impact <id>      who breaks if this is removed?
                         list             all nodes (with --kind / --parent / --status / --search filters)
                         edges            all edges (with --from / --to / --rel filters)
                         stats            node + edge counts by kind/relationship
                         usecases         use case index (--actor filters)
                         describe-usecase <id>   one use case, full detail
                         actors           actor index
                         sequences        sequence diagram index (--node filters)

archik upgrade           Pull the latest archik via the project's package manager
                         (auto-detects npm / pnpm / yarn / bun from the lockfile)
                         then refreshes SKILL.md + slash commands from the new binary
                         --skip-install    just refresh artifacts; don't reinstall

archik skill             Install the Claude skill for AI editing
                         --user           install into ~/.claude/skills (all projects)
                         --force          overwrite an existing skill
archik commands          Install the /archik:* slash commands for Claude Code
                         --user           install into ~/.claude/commands (all projects)
                         --force          overwrite existing commands
archik schema [variant]  Print the document schema as a reference (--json supported)
                         (no arg)         architecture document
                         seq              sequence diagram
                         uc               use case
                         actors           actors file
```

Without a `[path]` argument, archik resolves the file in this order:

1. `.archik/main.archik.yaml` (preferred — keeps the project root tidy)
2. `architecture.archik.yaml` (legacy root location — still fully supported)

If both exist the command errors out and asks you to pick one.

## Manual install

If you already have an archik file and just want to add the Claude integration to it:

**Via the npm CLI:**

```bash
npx archik@latest skill --user        # install skill into ~/.claude/skills (all projects)
npx archik@latest commands --user     # install /archik:* into ~/.claude/commands (all projects)
```

Drop the `--user` flag to scope to the current project only.

**Via Claude Code's plugin marketplace:**

```
/plugin marketplace add bacharSalleh/archik
/plugin install archik@archik
```

Either path leaves the same skill + the same 11 slash commands in the same target directories.

## When to use it (and when not to)

**Use archik when**

- Your project has more than ~5 components and you want the diagram to stay accurate
- You're using Claude Code (or any AI agent) to author code, and you want the agent to reason about structure instead of guess from filenames
- You're shipping in milestones and want "are we done?" to be mechanically answerable
- You have CI and want a gate that fails on architectural drift

**Skip it when**

- It's a one-file script or a throwaway prototype
- The architecture diagram is for a slide deck (use Mermaid)
- You don't have a build step or CI

The full schema reference (every node kind, every relationship, common patterns, hard rules) lives in [`skills/archik/SKILL.md`](skills/archik/SKILL.md) — installed automatically by `archik init` so Claude reads it before doing structural work.

## Use it in CI

```bash
archik validate                                # schema + cross-file integrity
archik drift                                   # source-tree gaps
archik trace --fail-on partial                 # block merge on incomplete traceability
archik render --theme light --out docs/architecture.svg    # commit a static SVG
```

## Design notes

- **The YAML is the only persistent truth.** The canvas is a stateless projection that reloads on every file change (live-reload via SSE).
- **Layout is non-negotiable.** ELK lays out every render. Putting an `x`/`y`/`width` field at any level fails schema validation. No more "the diagram drifted because someone dragged a box."
- **Single instance per file** is enforced via a lock file in `$TMPDIR/archik-cli/`, so parallel `dev`/`start` against the same YAML are rejected with a friendly error.
- **The published npm package** ships only the bundled binary, the canvas assets, the skill, and the 11 slash commands. Zero runtime dependencies.

## License

MIT © [Bashar](https://github.com/bacharSalleh)
