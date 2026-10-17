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
  archik init --paradigm oop|functional|none
  archik init --superpowers | --no-superpowers
  archik init --claude-md append|overwrite
  archik init --no-skill | --no-commands | --no-loop

FLAGS
  --no-skill         skip installing the Claude Code skill
  --no-commands      skip installing the /archik:* slash commands
  --no-loop          skip the engineering loop + CLAUDE.md wiring
  --paradigm <p>     coding principles to install: oop | functional | none
  --superpowers      wire superpowers skills into the loop phases
  --no-superpowers   keep the loop self-contained (no overlay)
  --claude-md <m>    when CLAUDE.md already exists: append | overwrite

INTERACTIVE
  In a TTY, init prompts for the paradigm (OOP / Functional), for
  superpowers integration, and — if CLAUDE.md already exists — for
  append vs overwrite. Pass the flags above to skip the prompts
  (required in CI / piped contexts, where init falls back to
  paradigm=none, no superpowers, claude-md=append).

ARTIFACTS (all @-referenced from CLAUDE.md, refreshable by upgrade)
  .archik/ENGINEERING_LOOP.md   the loop + HITL gates
  .archik/PRINCIPLES.md         OOP or Functional coding rules
  .archik/SUPERPOWERS.md        phase → superpowers-skill map (opt-in)

EXAMPLES
  archik init
  archik init --paradigm functional --no-superpowers
  archik init --paradigm oop --superpowers --claude-md append
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
  • sourcePath exists for code-bearing nodes.
  • Governance constraints across the merged diagram.

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
  archik schema [--json]

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

  diff: `archik diff — compare two archik documents (files or git refs)

USAGE
  archik diff <before> [after]
  archik diff <a.yaml> <b.yaml> --out diff.svg
  archik diff main                  # doc at ref main vs working tree
  archik diff v1.2.0 v1.4.0         # doc at one ref vs another
  archik diff <a.yaml> <b.yaml> --json

ARGUMENTS
  Each side is a YAML file on disk or a git ref (branch, tag, SHA).
  An existing file path always wins; otherwise the argument must
  resolve to a commit. With a single argument, the before side is
  that ref and the after side is the working-tree document. Git refs
  load the full merged diagram at that commit (root + every
  .archik/*.archik.yaml sub-file, sidecars excluded).

FLAGS
  --out <file>       also write a colour-coded SVG diff
  --theme <name>     "dark" (default) or "light"
  --json             structured diff output for agents

NOTES
  Intended for human review of suggestion sidecars (archik diff
  main.archik.yaml main.archik.suggested.yaml), for "what did this
  branch change architecturally?" (archik diff origin/main), and for
  CI pre/post architectural drift checks.
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

  principles: `archik principles — install coding principles for the BUILD phase

USAGE
  archik principles oop
  archik principles functional
  archik principles --force

ARGUMENTS
  oop | functional   which paradigm's rules to install. Omitted in a
                     TTY → you're prompted; omitted in CI → error.

FLAGS
  --force            overwrite an existing .archik/PRINCIPLES.md

DESCRIPTION
  Writes .archik/PRINCIPLES.md from the chosen paradigm:
    oop         — separation of concerns, composition over inheritance,
                  SOLID, design patterns used judiciously, clean code.
    functional  — purity, immutability, composition, side-effects at the
                  edges, total functions, declarative style.
  These govern HOW code is written once the loop reaches BUILD; they
  never override a HITL gate. Reference from CLAUDE.md with
  @.archik/PRINCIPLES.md.

NOTES
  Installed via the archik init paradigm prompt and refreshed in place
  by archik upgrade (the source paradigm is recovered from a marker).
`,

  superpowers: `archik superpowers — install the superpowers overlay

USAGE
  archik superpowers
  archik superpowers --force

FLAGS
  --force            overwrite an existing .archik/SUPERPOWERS.md

DESCRIPTION
  Writes .archik/SUPERPOWERS.md, mapping each loop phase to a
  superpowers skill (DESIGN → brainstorming, BUILD plan → writing-plans,
  BUILD → test-driven-development, bugs → systematic-debugging, VERIFY →
  verification-before-completion, pre-merge → requesting-code-review).
  Each skill FEEDS the matching archik artifact — it doesn't replace it.
  Reference from CLAUDE.md with @.archik/SUPERPOWERS.md.

NOTES
  Opt-in at archik init time and refreshed by archik upgrade only when
  already present. Warns (but still installs) if the superpowers plugin
  isn't detected under ~/.claude/plugins.
`,

  import: `archik import — bootstrap an archik document from existing config

USAGE
  archik import compose [file] [--out <file>] [--force] [--name <n>]
  archik import mermaid <file> [--out <file>] [--force] [--name <n>]

SUBCOMMANDS
  compose            import from docker-compose (default file:
                     docker-compose.yml / .yaml, compose.yml / .yaml)
  mermaid            import a flowchart/graph diagram — a raw .mmd
                     file or markdown containing a \`\`\`mermaid block

FLAGS
  --out <file>       write the generated YAML (refuses to overwrite
                     without --force); default prints to stdout
  --force            overwrite an existing --out target
  --name <n>         document name (default: current directory name)

DESCRIPTION
  compose: turns services into a first-pass diagram — well-known
  images map to kinds (postgres → database, redis → cache, kafka →
  stream, nginx → gateway, qdrant → vectordb, …); services with a
  build context that exists on disk become \`service\` nodes with a
  sourcePath; everything else imports as \`external\` until you
  reclassify it. depends_on (list or map form) becomes depends_on
  edges.

  mermaid: parses the flowchart subset — node shapes map to kinds
  ([(…)] cylinder → database, ((…)) circle → external, label
  keywords for queue/cache/gateway), subgraphs become module parents,
  arrows become depends_on edges with |labels| preserved. Unsupported
  syntax is skipped with a warning, never a hard failure.

  Output is schema-validated before it is emitted.

  Imported descriptions state their provenance — refining them into
  real responsibility statements is the natural next step (or hand
  the file to your agent and ask for /archik:evolve).

EXAMPLES
  archik import compose
  archik import compose --out .archik/main.archik.yaml
  archik import compose infra/docker-compose.yml --name "Shop"
  archik import mermaid docs/architecture.mmd --out .archik/main.archik.yaml
`,

  mcp: `archik mcp — Model Context Protocol server over stdio

USAGE
  archik mcp                 (launched by an MCP client, not by hand)

DESCRIPTION
  Exposes the archik contract to ANY MCP-capable agent — Cursor,
  Windsurf, Copilot agent mode, Claude Desktop, Zed — not just
  Claude Code. Every tool delegates to the matching CLI command
  with --json, so the MCP surface and the CLI surface cannot drift.

TOOLS
  archik_schema            document schema reference
  archik_describe          one node + its edges
  archik_deps / archik_dependents / archik_impact
  archik_list_nodes        filters: kind/parent/file/status/search/owner
  archik_list_edges        filters: from/to/rel/status
  archik_stats             counts by kind and relationship
  archik_validate          full validation incl. governance constraints
  archik_drift             diagram vs source tree
  archik_smells            folder import loops + oversized files
  archik_affected          changed files → nodes + dependents
  archik_suggest_show / set / accept / reject
                           the sidecar lifecycle (set takes the full
                           draft YAML; accept only after human approval)

CLIENT CONFIGURATION (typical mcpServers entry)
  { "archik": { "command": "npx", "args": ["archik", "mcp"] } }

  Launch from the project root — tools resolve the archik document
  relative to the server's working directory.
`,

  otel: `archik otel — verify the diagram against production telemetry

USAGE
  archik otel check --graph <dependencies.json> [--json]

FLAGS
  --graph <file>     a service-dependency graph export: Jaeger's
                     GET /api/dependencies JSON (raw array or
                     {data: …} wrapper) — entries of
                     {parent, child, callCount}
  --json             structured output

DESCRIPTION
  Maps graph service names onto nodes (metadata.otelService wins,
  node id is the fallback) and compares production reality with the
  declared edges:

    UNDECLARED CALL   runtime traffic between two nodes with no edge
                      in the diagram. Fails the check (exit 1).
    UNOBSERVED EDGE   a wire edge (http_call, grpc, websocket,
                      webhook, invokes, routes_to) between two
                      observed services saw no traffic — reported
                      informationally; rare paths go quiet.
    UNMAPPED SERVICE  a graph name no node claims — bind it with
                      metadata.otelService rather than guessing.

  This is the runtime end of the truth chain: validate proves the
  model is internally consistent, drift --edges proves it matches
  the code, otel check proves it matches production.

EXAMPLES
  curl -s http://jaeger:16686/api/dependencies?endTs=...&lookback=86400000 > deps.json
  archik otel check --graph deps.json
  archik otel check --graph deps.json --json    # CI / dashboards
`,

  owners: `archik owners — keep CODEOWNERS in step with node owners

USAGE
  archik owners sync [--json]
  archik owners check [--json]

DESCRIPTION
  Every node declaring both \`owner\` and \`sourcePath\` becomes a
  CODEOWNERS rule (\`/<sourcePath>/ @<owner>\`), written into a
  clearly-marked managed block. Hand-authored rules outside the
  block are never touched. The file is found where GitHub looks
  (.github/CODEOWNERS, CODEOWNERS, docs/CODEOWNERS); sync creates
  .github/CODEOWNERS when none exists.

  \`check\` is the CI side: exit 1 when the block is missing or
  stale, so ownership changes in the model can't silently drift
  from review routing.

  Owner handles get an @ prefix unless they already carry one —
  keep node \`owner\` values aligned with GitHub team/user names.

EXIT CODES
  0  in sync (check) / synced (sync)
  1  stale or missing (check)
  2  argument / document errors

EXAMPLES
  archik owners sync
  archik owners check --json     # CI gate
`,

  hooks: `archik hooks — git pre-commit hook for model validation

USAGE
  archik hooks install [--with-drift] [--force]
  archik hooks uninstall

FLAGS
  --with-drift       also run \`archik drift\` in the hook
  --force            overwrite a pre-commit hook archik didn't write

DESCRIPTION
  Installs a pre-commit hook that runs \`archik validate\` before every
  commit, so a broken model never reaches CI. Honours core.hooksPath
  (husky-style setups) and refuses to clobber a hook it didn't write.
  Uninstall removes the hook only when archik installed it.

EXAMPLES
  archik hooks install
  archik hooks install --with-drift
  archik hooks uninstall
`,

  "merge-driver": `archik merge-driver — semantic three-way merge for archik YAML

USAGE
  archik merge-driver --install         one-time setup for this clone
  archik merge-driver <base> <ours> <theirs>   (invoked by git, not by hand)

DESCRIPTION
  Plain \`git merge\` treats archik YAML as text and conflicts whenever
  two branches touch adjacent lines. Nodes and edges are id-keyed, so
  most of those conflicts are mechanical:

    both sides added different entities     → keep both
    one side changed, the other didn't      → take the change
    both changed different fields of an id  → merge field-wise
    one side deleted, the other untouched   → delete

  Real conflicts remain conflicts: the same field changed differently,
  modify-vs-delete, or a merge that yields an invalid document (e.g.
  theirs added an edge to a node ours deleted). The driver writes the
  merged result with "ours" preferred on conflicting fields, prints
  each conflict to stderr, and exits 1 so git marks the path
  conflicted for manual resolution.

INSTALL
  \`archik merge-driver --install\` runs:
    git config merge.archik.name "archik semantic merge"
    git config merge.archik.driver "npx archik merge-driver %O %A %B"
  and adds \`*.archik.yaml merge=archik\` to the toplevel .gitattributes.
  The .gitattributes line is committed and shared; the git config is
  per-clone — each teammate runs --install once.

EXIT CODES
  0  clean merge
  1  conflicts (merged result written, user resolves)
  2  hard error (unparseable side; nothing written)
`,

  drift: `archik drift — detect when the diagram diverges from source code

USAGE
  archik drift [path]

FLAGS
  --json             structured output for agents (JSON)
  --ignore <file>    custom ignore file (default: .archik/.driftignore)
  --edges            also verify edges against the code's import graph

DESCRIPTION
  Compares the archik YAML against the actual source tree and reports
  mismatches. Two drift types are detected:

    ORPHAN   — a node has a sourcePath but that path doesn't exist on disk.
    UNMAPPED — a source directory exists but no node claims it.

  With --edges, the TS/JS files under every node's sourcePath are
  scanned for imports (static, re-export, require, dynamic; comments
  stripped) and the resulting graph is compared with the declared
  edges:

    SHADOW EDGE   — code in node A imports code in node B, but no
                    edge connects them. An undeclared dependency.
    PHANTOM EDGE  — a structural edge (depends_on, uses, has_a,
                    implements, extends) is declared between two
                    scannable nodes, but no import exists in either
                    direction.

  Conservative by design: only relative imports are resolved, a pair
  counts as covered by an edge in either direction, parent/child
  pairs are skipped, wire relationships (http_call, publishes, …)
  are never phantom-checked, and nodes without TS/JS files are
  exempt (other languages aren't penalised).

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

  affected: `archik affected — map changed files back onto the model

USAGE
  archik affected [--since <ref>] [--files <list>] [--json]

FLAGS
  --since <ref>      git ref to diff the working tree against (default: HEAD)
  --files <list>     comma-separated file list — skips git entirely
  --json             structured output for agents / CI

DESCRIPTION
  Takes the files that changed (committed + uncommitted + untracked vs
  --since, or an explicit --files list) and reports what the model says
  they touch:

    NODES        changed file sits at/under a node's sourcePath
    DEPENDENTS   nodes with an edge INTO a changed node — the code most
                 likely to break
    UNMAPPED     changed files no node claims (a model gap)

EXIT CODES
  0  success (even when nothing is affected)
  1  git error / root file failed to load
  2  argument error

EXAMPLES
  archik affected                       # working tree vs HEAD
  archik affected --since main          # everything this branch touches
  archik affected --since origin/main --json
  archik affected --files src/api/routes.ts,src/worker/run.ts
`,

  smells: `archik smells — structural smells backed by code evidence

USAGE
  archik smells [dir] [--max-file-lines <n>] [--json] [--fail-on-warn]

FLAGS
  --max-file-lines <n>  line limit per source file (default 500)
  --json                structured output for agents / CI
  --fail-on-warn        exit 1 when any smell is found (CI gate)

DESCRIPTION
  Reads the TS/JS source tree directly — no archik model needed.

    FOLDER LOOP     sibling folders that import each other, directly or
                    through a chain. Each edge shows real imports
                    (file → specifier) as evidence.
    OVERSIZED FILE  a source file longer than --max-file-lines.

  Only relative imports are resolved, so every loop reported is real
  (aliases like "@/x" are not followed yet). Skips node_modules, dist,
  build, out, coverage, vendor, target and dot folders.

EXIT CODES
  0  success (or smells found without --fail-on-warn)
  1  smells found with --fail-on-warn
  2  argument error (dir not found)

EXAMPLES
  archik smells
  archik smells apps/runtime/src --max-file-lines 400
  archik smells --json
`,

  upgrade: `archik upgrade — upgrade archik to latest and refresh Claude artifacts

USAGE
  archik upgrade
  archik upgrade --user
  archik upgrade --skip-install
  archik upgrade --no-claude-md

FLAGS
  --user             refresh skill + commands user-wide (~/.claude/) instead of project-local
  --skip-install     skip the npm upgrade; only re-copy the artifacts
  --no-claude-md     don't touch CLAUDE.md (skip the @-reference wiring)

WHAT IT DOES
  1. Checks the installed version against the npm registry.
  2. Upgrades the package using your project's package manager
     (npm / pnpm / yarn / bun — detected from lockfile).
  3. Re-copies the bundled SKILL.md, /archik:* slash commands, and
     .archik/ENGINEERING_LOOP.md from the newly installed version
     (--force, so stale files are always overwritten). Also refreshes
     .archik/PRINCIPLES.md and .archik/SUPERPOWERS.md — but only when
     the project already has them (opt-in artifacts are never imposed).
  4. Wires CLAUDE.md: ensures it @-references the refreshed artifacts via
     an archik-managed block (append-only — your own prose is preserved;
     the block is created if absent and regenerated if already present).
     Skip with --no-claude-md.
  5. Tells you to start a new Claude Code conversation so the
     updated skill is loaded into context.

NOTES
  If archik is not in the project's package.json (global or npx
  usage), the package upgrade step is skipped and you are shown
  the manual upgrade command. The artifacts are still refreshed
  from the currently running version.

  Use --skip-install when you have already upgraded the package
  manually and just need the artifacts to catch up.

EXAMPLES
  archik upgrade
  archik upgrade --user
  archik upgrade --skip-install
  archik upgrade --no-claude-md
`,

  evolution: `archik evolution — the self-evolution loop

USAGE
  archik evolution status                 counts + whether observation is on
  archik evolution enable|disable         opt observation in / out
  archik evolution reflect                heuristics over the log → proposals
  archik evolution proposals [show <id>]  list / inspect proposals
  archik evolution propose <file|->       store an agent-authored proposal
  archik evolution approve <id>           apply (gated)
  archik evolution reject <id>            decline (recorded)
  archik evolution report                 7-day trends vs the week before

DESCRIPTION
  The loop: observe → reflect → propose → validate → apply → measure.

  observe   Every finished CLI command appends events (command name,
            flag names, outcome, duration — never values or file
            contents) to .archik/evolution/events.jsonl. Local-only
            and OPT-IN via 'archik evolution enable'.
  reflect   Deterministic heuristics turn events into insights:
            rejection streaks, recurring validation failures,
            recurring drift, repeatedly failing commands.
  propose   Each new insight becomes a pending YAML proposal in
            .archik/evolution/proposals/ with auditable evidence.
            Agents can file richer proposals via 'evolution propose'.
  apply     'approve' is the gate. skill-note proposals append to
            .archik/evolution/learned.md (read by the Claude skill
            and the archik://learned MCP resource). Diagram changes
            are staged as a suggestion sidecar — reviewed on the
            canvas, applied via 'archik suggest accept'.
  measure   'report' compares the last 7 days with the 7 before:
            error rate, suggestion acceptance rate, drift failures.

  Nothing is ever applied silently. Rejecting a proposal is itself
  recorded — the loop learns from "no".

EXIT CODES
  0  success
  1  apply/validation failure (e.g. pending sidecar, invalid result)
  2  argument error or unknown id

EXAMPLES
  archik evolution enable
  archik evolution reflect
  archik evolution approve p-2026-06-10-a1b2
  archik evolution report --json
`,
  patterns: `archik patterns — self-evolution pattern library

USAGE
  archik patterns list          all patterns with one-line intents
  archik patterns show <id>     print the full pattern document
  archik patterns apply <id>    stage the blueprint into your diagram

DESCRIPTION
  A library of named, documented architecture patterns for building
  self-evolving systems — each with intent, structure, safety rules,
  trade-offs, and where archik itself uses it.

  'apply' never edits your diagram directly: the blueprint is merged,
  validated, and staged as a suggestion sidecar (status: proposed
  nodes), which you review on the canvas and accept or reject.

PATTERNS
  evolution-loop          observe → reflect → propose → validate →
                          apply → measure, as components (has blueprint)
  sidecar-approval-gate   machines propose via a sidecar; humans accept
  learned-overlay         approved lessons layered over a fixed prompt
  truth-chain             model verified vs itself, code, and production
  feedback-pipeline       every user correction becomes a signal

EXIT CODES
  0  success
  1  apply failed (pending sidecar, id collision, validation, doc-only)
  2  argument error or unknown pattern

EXAMPLES
  archik patterns list
  archik patterns show evolution-loop
  archik patterns apply evolution-loop
`,
};
