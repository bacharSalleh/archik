/**
 * Per-command help text. Each subcommand of the archik CLI gets a
 * targeted `--help` page so agents (and humans) can introspect its
 * surface without reading the global help dump.
 *
 * Convention for each entry:
 *   1. One-line summary, then a blank line
 *   2. USAGE block
 *   3. Subcommands (if any)
 *   4. Flags
 *   5. Examples
 *   6. Exit codes (when non-trivial)
 *
 * Agents are the primary audience — keep the lines copy-pasteable
 * and avoid prose that doesn't survive being read out of context.
 */
export const COMMAND_HELP: Record<string, string> = {
  init: `archik init — scaffold a starter .archik/main.archik.yaml

USAGE
  archik init [path]
  archik init --no-skill
  archik init --no-commands
  archik init --no-loop

FLAGS
  --no-skill         skip installing the Claude Code skill
  --no-commands      skip installing the /archik:* slash commands
  --no-loop          skip installing the engineering-loop template

DEFAULTS
  Path defaults to .archik/main.archik.yaml; pass an explicit path
  to override. Skill, slash commands, and the engineering loop
  install automatically unless opted out. The engineering loop
  lands at .archik/ENGINEERING_LOOP.md and CLAUDE.md is updated
  with a one-line @-reference to it.

EXAMPLES
  archik init
  archik init --no-skill
  archik init --no-commands
  archik init --no-loop
`,

  dev: `archik dev — open the live canvas in your browser (foreground)

USAGE
  archik dev [path]

FLAGS
  --port <n>         dev server port (default 5173)
  --host <addr>      bind address (default 127.0.0.1)
  --no-open          don't auto-open the browser

DEFAULTS
  Path defaults to .archik/main.archik.yaml (preferred) or
  architecture.archik.yaml (legacy). Errors if both exist.

  Foreground: blocks the terminal until Ctrl+C. For detached, see
  archik start.

EXAMPLES
  archik dev
  archik dev --port 5180 --no-open
`,

  start: `archik start — open the live canvas detached (returns immediately)

USAGE
  archik start [path]

FLAGS
  --port <n>         dev server port (default 5173)
  --host <addr>      bind address (default 127.0.0.1)
  --no-open          don't auto-open the browser

NOTES
  Acquires a per-file lock under $TMPDIR/archik-cli/, so two starts
  against the same YAML are rejected with a friendly error. Use
  archik stop / archik status to manage running instances.

EXAMPLES
  archik start
  archik start .archik/main.archik.yaml --port 5180
`,

  stop: `archik stop — terminate the detached dev server for a file

USAGE
  archik stop [path]

NOTES
  Sends SIGTERM, then SIGKILL after a 5s grace window. Stale state
  files are cleaned up silently if the recorded process is already
  gone.

EXAMPLES
  archik stop
  archik stop .archik/main.archik.yaml
`,

  status: `archik status — list running archik instances across all projects

USAGE
  archik status

NOTES
  Reads $TMPDIR/archik-cli/ for recorded daemons. Each entry is
  cross-checked with a 1.5s HTTP HEAD probe against its loopback
  URL; non-responsive entries are removed automatically. Use this
  command to recover from "another instance is running" errors
  caused by a stale lock.
`,

  validate: `archik validate — schema + cross-file checks against an archik file

USAGE
  archik validate [path]
  archik validate [path] --json

FLAGS
  --json             structured output: { ok, file, nodes, edges, errors }

CHECKS
  • Schema (Zod) — every required field, every kind, every relationship.
  • Cross-file existence — archikFile / fromFile / toFile must be on disk.
  • IDs unique within nodes, within edges; edges reference real nodes.
  • No self-loop edges, no parentId cycles.
  • Use cases (*.archik.uc.yaml): slice tests exist on disk; primaryActor /
    secondaryActors resolve in the actor index; realization.seqFile points
    at a discovered seq file; bidirectional realizes integrity.
  • ECB transition rules (Jacobson robustness) on realizes-bound seq
    diagrams: boundary->control, control->{boundary|control|entity},
    entity->{control|entity}. Boundaries don't talk to boundaries or
    entities; entities don't talk to boundaries. Untagged nodes are
    skipped (gradual adoption).

EXIT CODES
  0  valid
  1  schema or cross-file error (errors printed to stderr)
`,

  render: `archik render — render the diagram to a self-contained SVG

USAGE
  archik render [path]
  archik render [path] --out diagram.svg --theme light

FLAGS
  --out <file>       output path (default diagram.svg)
  --theme <name>     "dark" (default) or "light"

NOTES
  Layout is computed by ELK on every render — no coordinates in the
  YAML. Output is a self-contained SVG suitable for committing under
  docs/ or pasting into a README.

EXAMPLES
  archik render --out docs/architecture.svg --theme light
`,

  watch: `archik watch — re-render to SVG on every file change

USAGE
  archik watch [path]
  archik watch [path] --out diagram.svg --theme light

FLAGS
  --out <file>       output path (default diagram.svg)
  --theme <name>     "dark" (default) or "light"

NOTES
  Foreground; Ctrl+C to stop. Prefer archik start for interactive
  editing — watch is for "render to disk on save" workflows.
`,

  schema: `archik schema — print the document schema in agent-readable form

USAGE
  archik schema [seq | uc | actors] [--json]

SUBCOMMANDS
  (none)             architecture document (*.archik.yaml)
  seq                sequence diagram (*.archik.seq.yaml)
  uc | usecase       use case (*.archik.uc.yaml)
  actors | actor     actor file (*.archik.actors.yaml)

FLAGS
  --json             structured shape: { document, node, edge, kinds, ... }

NOTES
  Single source of truth for what a valid Archik document looks
  like — every field's name, type, and "is it an array?" status,
  plus the full list of node kinds and relationships.

  Run this BEFORE authoring a YAML draft via \`suggest set\`. The
  prose in the Claude skill describes the workflow, not the
  schema; this command is the schema.

EXAMPLES
  archik schema
  archik schema seq
  archik schema uc --json | jq '.slice'
  archik schema actors
  archik schema --json | jq '.kinds'
  archik schema --json | jq '.edge[] | select(.required)'
`,

  q: `archik q — query the diagram (agent-friendly, --json supported)

USAGE
  archik q describe <id>
  archik q deps <id>
  archik q dependents <id>
  archik q list [--kind <k>] [--parent <id>] [--file <p>] [--status <s>] [--search <t>]
  archik q edges [--from <id>] [--to <id>] [--rel <name>] [--status <s>]
  archik q impact <id>
  archik q stats
  archik q sequences [--node <id>]
  archik q usecases [--actor <id>]
  archik q describe-usecase <id>
  archik q actors

FLAGS (any subcommand)
  --json             stable machine-readable shape on stdout

NOTES
  Walks the root archik file plus every .archik/*.archik.yaml
  sub-file. Cross-file id collisions error rather than silently
  picking. Read commands resolve the doc path the same way as
  archik validate.

EXIT CODES
  0  found
  1  empty / unknown id
  2  could not load (root file missing or invalid)

EXAMPLES
  archik q describe orders
  archik q list --kind service --json
  archik q impact payments-db
`,

  diff: `archik diff — compare two archik documents

USAGE
  archik diff <a.yaml> <b.yaml>
  archik diff <a.yaml> <b.yaml> --out diff.svg
  archik diff <a.yaml> <b.yaml> --json

FLAGS
  --out <file>       also write a colour-coded SVG diff
  --theme <name>     "dark" (default) or "light"
  --json             structured diff output for agents

NOTES
  Intended for human review of suggestion sidecars (archik diff
  main.archik.yaml main.archik.suggested.yaml) and for CI
  pre/post architectural drift checks.
`,

  suggest: `archik suggest — manage Claude's pending architecture suggestion

USAGE
  archik suggest show [--json]
  archik suggest set <draft> [--note '<text>'] [--main <path>] [--json]
  archik suggest accept [path]
  archik suggest reject [path]

SUBCOMMANDS
  show      Summarise the pending sidecar (default if no sub given)
            --json   structured output for agents

  set       Validate a draft YAML and stage it as the sidecar.
            <draft> can be a file path or "-" to read stdin.
            --note '<text>'   set metadata.suggestion.note
            --main <path>     override main file detection
            --allow-orphan    permit a sidecar for a main file that
                              doesn't exist yet (used to propose a
                              brand-new sub-architecture)
            --json            structured output for agents

  accept    Apply the sidecar over the main file (atomic rename).

  reject    Discard the sidecar (delete the .suggested.yaml file).

NOTES
  set is the only sanctioned writer of the sidecar. Pipe via
  stdin to avoid temp files entirely:

    cat draft.yaml | archik suggest set - --note "add Stripe"

  Refuses to use the main file as the draft. set overwrites any
  existing sidecar without prompting.

EXIT CODES
  0  success
  1  validation error / no pending sidecar / invalid args
`,

  skill: `archik skill — install the Claude Code skill into a project

USAGE
  archik skill
  archik skill --user
  archik skill --force

FLAGS
  --user             install into ~/.claude/skills (all projects)
  --force            overwrite an existing skill

NOTES
  Installed automatically by archik init. Use this command to
  refresh the skill on an existing install or to install
  user-wide.
`,

  commands: `archik commands — install the /archik:* slash commands for Claude Code

USAGE
  archik commands
  archik commands --user
  archik commands --force

FLAGS
  --user             install into ~/.claude/commands (all projects)
  --force            overwrite existing commands

NOTES
  Installed automatically by archik init. Seven commands ship:
  /archik:spawn, /archik:evolve, /archik:suggest, /archik:describe,
  /archik:dev, /archik:accept, /archik:reject.
`,

  loop: `archik loop — install the engineering-loop template

USAGE
  archik loop
  archik loop --force

FLAGS
  --force            overwrite if .archik/ENGINEERING_LOOP.md already exists

DESCRIPTION
  Copies the engineering-loop template (brief → requirements →
  structural → behavioral → build → code, with HITL gates) into
  .archik/ENGINEERING_LOOP.md. Project's CLAUDE.md picks it up via
  @.archik/ENGINEERING_LOOP.md — add that line manually, or let
  archik init wire it for you on a fresh project.

NOTES
  Installed automatically by archik init and refreshed in place by
  archik upgrade. Always project-scoped (lives under .archik/).
`,

  drift: `archik drift — detect when the diagram diverges from source code

USAGE
  archik drift [path]

FLAGS
  --json             structured output for agents (JSON)
  --ignore <file>    custom ignore file (default: .archik/.driftignore)

DESCRIPTION
  Compares the archik YAML against the actual source tree and reports
  mismatches. Two drift types are detected:

    ORPHAN   — a node has a sourcePath but that path doesn't exist on disk.
    UNMAPPED — a source directory exists but no node claims it.

  Nodes with status "proposed" or "deprecated" are skipped.
  Nodes without sourcePath are skipped (e.g. external services).

  The .archik/.driftignore file lists glob patterns for directories to
  exclude from unmapped detection (one per line, # comments).

EXIT CODES
  0 — no drift detected (diagram matches source tree)
  1 — drift found (orphans or unmapped code)

EXAMPLES
  archik drift
  archik drift --json
  archik drift --ignore .archik/custom-ignore
`,

  trace: `archik trace — use case x slice x test x seq x node coverage matrix

USAGE
  archik trace [--use-case <id>] [--actor <id>] [--status <s>]
               [--coverage <l>] [--fail-on <l>] [--json]

FLAGS
  --use-case <id>    filter rows to one use case
  --actor <id>       filter to use cases involving an actor (primary or secondary)
  --status <s>       filter slices by status (active | proposed | deprecated)
  --coverage <l>     filter rows by coverage level (full | partial | none)
  --fail-on <l>      exit 1 if any row is at that level or worse (partial or none)
  --json             structured TraceMatrix output for CI

DESCRIPTION
  Walks every slice in every *.archik.uc.yaml and threads the chain
  through its tests, sequence diagram realization, and the architecture
  nodes that participate in the seq. Each row is classified:

    full     - tests + realization + every participant has a stereotype,
               and the slice is active.
    partial  - some of {tests, realization} present but not fully wired.
    none     - no tests AND no realization.

  This is the read side of Jacobson traceability: the validator catches
  broken links; trace surfaces coverage. CI scripts that want "fail on
  partial coverage" use --fail-on partial; default is no gate.

EXIT CODES
  0  success (or --fail-on threshold not reached)
  1  any row meets the --fail-on threshold
  2  argument error or root file failed to load

EXAMPLES
  archik trace
  archik trace --use-case place-order
  archik trace --actor customer
  archik trace --coverage partial --json
  archik trace --fail-on partial          # CI gate
`,

  upgrade: `archik upgrade — upgrade archik to latest and refresh Claude artifacts

USAGE
  archik upgrade
  archik upgrade --user
  archik upgrade --skip-install

FLAGS
  --user             refresh skill + commands user-wide (~/.claude/) instead of project-local
  --skip-install     skip the npm upgrade; only re-copy the skill and slash commands

WHAT IT DOES
  1. Checks the installed version against the npm registry.
  2. Upgrades the package using your project's package manager
     (npm / pnpm / yarn / bun — detected from lockfile).
  3. Re-copies the bundled SKILL.md, /archik:* slash commands, and
     .archik/ENGINEERING_LOOP.md from the newly installed version
     (--force, so stale files are always overwritten).
  4. Tells you to start a new Claude Code conversation so the
     updated skill is loaded into context.

NOTES
  If archik is not in the project's package.json (global or npx
  usage), the package upgrade step is skipped and you are shown
  the manual upgrade command. The skill and commands are still
  refreshed from the currently running version.

  Use --skip-install when you have already upgraded the package
  manually and just need the skill/commands to catch up.

EXAMPLES
  archik upgrade
  archik upgrade --user
  archik upgrade --skip-install
`,

  alpha: `archik alpha — Essence alpha state tracker

USAGE
  archik alpha show [--json]
  archik alpha promote <alpha> <state> [--note '<text>'] [--json]
  archik alpha demote  <alpha> <state> [--json]

ALPHAS  (the four archik tracks; the rest of the Essence kernel is out of scope)
  stakeholders     recognised | represented | involved | in-agreement |
                   satisfied-for-deployment | satisfied-in-use
  requirements     conceived | bounded | coherent | acceptable | addressed | fulfilled
  softwareSystem   architecture-selected | demonstrable | usable | ready |
                   operational | retired
  work             initiated | prepared | started | under-control |
                   concluded | closed

DESCRIPTION
  Tracks the four Essence alphas archik can directly evidence from
  the artifacts it manages. Each state ladder is ordered; promote
  walks UP and runs a machine-checkable condition before writing
  (subjective states succeed without a check). Demote walks DOWN
  freely.

  show re-runs every check against the claimed state and renders a
  verification badge:
    tick  verified           — claim holds against current artifacts
    cross over-claimed       — claim FAILS the check; downgrade or fix
    ?     subjective         — no machine check; user attests

  Machine checks (subset of states):
    requirements.acceptable      every active slice has on-disk tests
    requirements.addressed       every active slice has a discovered seq
    softwareSystem.demonstrable  every active code-bearing node has on-disk source
    softwareSystem.ready         every active slice is "level: full" in trace
    work.started                 at least one active slice exists
    stakeholders.represented     at least one human actor exists

EXIT CODES
  0  success
  1  promote/demote rejected (check failed, ladder violation, etc.)
  2  argument error or root file failed to load

EXAMPLES
  archik alpha show
  archik alpha show --json
  archik alpha promote requirements acceptable
  archik alpha promote stakeholders involved --note 'kickoff with finance'
  archik alpha demote softwareSystem demonstrable
`,
};
