# Changelog

All notable changes to **archik** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
-

### Changed
-

### Fixed
-

## [0.7.6] - 2026-04-30

### Added
- Four FE-developer node kinds — `page`, `component`, `store`,
  `hook`. The taxonomy used to collapse the entire client side
  into a single `frontend` kind; now a React/Vue/Svelte app can
  be modeled the way FE engineers think — pages (route-level
  screens, rose), components (reusable UI, violet), stores
  (client state, yellow), hooks (composable client logic,
  teal). All four reuse the standard `ServiceNode` card and
  earn their identity from the kind icon, color, and KIND
  header label. The pre-existing `frontend` kind stays — still
  the right choice for "the whole frontend system as one box"
  in backend-focused diagrams.

### Changed
- `.archik/main.archik.yaml` — the `canvas` node moves from
  `kind: frontend` to `kind: page` so the project's own
  diagram exercises the new kind.

## [0.7.5] - 2026-04-29

### Changed
- `/archik:spawn` step 8a now requires the agent to narrate *why*
  each sub-file `suggest accept` is mechanical — the parent draft
  references sub-files via `archikFile:` and `suggest set`
  validates target-on-disk, so the sub-file accepts must happen
  before the main draft can be staged. Previously the agent
  emitted a terse "accept each" status line that read
  indistinguishably from skipping the user's `/archik:accept`
  review on the main draft. The example narration in the slash
  command body and the inline bash-block comment make the
  distinction visible to skim-readers.
- `SKILL.md` adds an explicit one-liner under "Slash commands"
  stating the agent/user invocation split: the agent always runs
  `npx archik` directly; `/archik:*` is user-typed only. Closes
  the higher-level "why didn't the agent use `/archik:accept`?"
  loophole at the skill level.

### Fixed
- `archik status` now self-heals when `.archik/runtime.json` was
  deleted out from under a running daemon (typically by a `git
  clean -fdX` matching the `.gitignore` line `archik init`
  appends, or by an editor's "clean untracked" action).
  Previously the project-local section silently disappeared while
  the daemon kept serving HTTP. Status now reads the canonical
  tmpdir state at `$TMPDIR/archik-cli/<hash>.json`, verifies the
  recorded PID is alive, and rebuilds `runtime.json` from it.
  Stays silent when the daemon is genuinely gone — same UX as
  before in that case.

## [0.7.4] - 2026-04-29

### Added
- `npx archik schema` — single source of truth for the document
  shape. Prints every field, its required/optional status, its
  type ("array of string" vs "string"), the full kinds and
  relationships lists, and the cross-cutting constraints. `--json`
  for piping into jq. Agents (and humans) should run this before
  authoring a YAML draft instead of guessing from prose.
- Validation errors now include an actionable `hint:` for the two
  canonical first-attempt mistakes — `notes`/`responsibilities`
  written as a single string instead of an array, and edges
  missing their required `id`. The hints point back at
  `npx archik schema` for the full shape.

### Changed
- `SKILL.md` rewritten — 767 lines down to 214 (~72% slimmer).
  The skill now teaches Claude to drive archik through the CLI
  rather than describing the YAML schema in prose. Hard rule
  reinforced: no `Read`/`Write`/`Edit` against archik files.
  New "Follow-ups" section: after every accept/reject, propose a
  concrete next step (implement, evolve, regenerate the SVG)
  rather than ending the turn at "done".
- `/archik:suggest`, `/archik:spawn`, and `/archik:evolve` slash
  commands now call `npx archik schema` as an explicit step
  before authoring the draft, so the YAML is built against the
  actual shape rather than from intuition. Each also prompts for
  a follow-up at the end ("implement / evolve / regenerate svg").

### Added
- Project-local runtime state at `.archik/runtime.json`. `archik
  dev` and `archik start` now write the running daemon's PID,
  port, host, URL, and start time into this file when the server
  comes up; `archik stop` and graceful shutdown remove it.
  Distinct from the cross-project tmpdir registry — this file
  makes "is archik running for THIS project?" answerable from
  inside the project itself, without scanning a global directory.
- `archik init` appends `.archik/runtime.json` to an existing
  `.gitignore`, since the file is per-machine ephemeral state and
  shouldn't be committed. No-op when no `.gitignore` is present —
  creating one is a project-level decision.

### Changed
- `archik status` now leads with a "This project" section read
  from `.archik/runtime.json` when invoked inside an archik
  project, then lists "Other projects" from the cross-project
  registry. Stale `.archik/runtime.json` (PID dead) is cleaned up
  silently with a one-line note. The cross-project list filters
  out the current project to avoid duplication.
- `archik dev` / `archik start` now print a yellow warning when
  the requested `--port` was in use and the dev server bound to a
  different one — previously the rebind was silent, so users with
  a `--port 5173` preference might not realise they ended up on
  5174.

### Added
- Per-command `--help` for every CLI subcommand. `npx archik
  suggest --help`, `npx archik q --help`, `npx archik status
  --help`, etc., now print a focused usage / flags / examples /
  exit-codes page so agents can introspect each command without
  reading the global help dump.
- `--allow-orphan` flag on `archik suggest set`. Stages a sidecar
  whose target main file doesn't yet exist on disk — used when
  proposing a brand-new sub-architecture. Without the flag,
  `suggest set` now refuses to write an orphan with a clear error
  pointing at the parent-file workflow.
- `/archik:spawn` and `/archik:evolve` slash commands now pipe
  the proposed YAML through stdin to `npx archik suggest set -`
  via a heredoc, instead of writing a temp file under `/tmp/`.
  Same goes for `/archik:suggest`. Eliminates a class of
  permission / path-resolution failures and the symptom where
  Claude could leak a `/tmp/` path into a canvas URL.

### Changed
- Slash-menu descriptions tightened — the `/archik:` prefix
  already provides the namespace, so there's no need to repeat
  "the archik diagram" / "the pending suggestion sidecar":
  - `/archik:suggest` → "Propose a diagram change"
  - `/archik:spawn`   → "Mirror the source tree as a diagram"
  - `/archik:evolve`  → "Propose a cleaner modular refactor"
  - `/archik:describe`→ "Show a node's connections"
  - `/archik:dev`     → "Open the live canvas"
- `archik init` now suggests `/archik:spawn` first in the "Try
  this in Claude Code" hint — bootstrap from real code, then
  iterate with `/archik:suggest`.
- `/archik:spawn` updated to use `--allow-orphan` when staging a
  brand-new sub-file's sidecar, then `accept` immediately so the
  sub-file is real on disk before the main draft references it.

### Fixed
- `archik status` now ground-truths each daemon's liveness with a
  1.5s HTTP HEAD probe of the recorded URL, in addition to the
  PID check. Stale entries (dev server crashed but parent process
  lingered, or PID got recycled within the start-time window)
  are removed automatically on every `status` run, so a phantom
  "PID 12345 → http://localhost:5173" no longer sits forever in
  the listing. The probe is restricted to loopback hosts —
  `localhost`, `127.0.0.1`, `[::1]`, `::1` — to avoid SSRF on a
  tampered state file.
- Orphan suggestion sidecars (`*.archik.suggested.yaml` with no
  sibling main file) were invisible in the browser. The server's
  file-listing endpoint now surfaces them as standalone entries
  with `isOrphanSuggestion: true`, and the FileSwitcher renders
  them with a "(pending)" label and a dashed accent border so the
  user can see what's waiting and accept it via
  `/archik:accept <path>` or `npx archik suggest accept <path>`.
  The dropdown also stays visible when there's a single real file
  plus pending suggestions — previously it self-hid on
  `files.length <= 1`.

## [0.7.1] - 2026-04-29

### Added
- `/archik:spawn` slash command — bootstrap an archik diagram by
  mirroring the project's source tree. Descriptive, not
  prescriptive: maps top-level dirs and manifest files to nodes,
  emits edges only with real evidence, drills into substantial
  subsystems via `archikFile`. Stages the result as a sidecar
  via `npx archik suggest set` for canvas review.
- `/archik:evolve` slash command — propose a cleaner refactor
  toward modular bounded contexts. Hunts for god services, leaky
  cross-context boundaries, missing port/adapter pairs, anaemic
  queues, cyclic dependencies. Prescriptive, but never
  auto-accepts; stages a sidecar and explicitly invites
  discussion before the user runs `/archik:accept`. Optional
  `$ARGUMENTS` to focus on one area.

### Changed
- Tightened descriptions on the five existing `/archik:*` slash
  commands so they read cleanly in Claude Code's slash menu
  (the `/archik:` prefix already provides the namespace).
- README onboarding rewritten around `npx archik@latest init` →
  `npx archik@latest start` → `/archik:spawn`. Adds a
  seven-command table and a typical first-day flow under
  "For Claude Code".

## [0.7.0] - 2026-04-29

### Added
- `archik suggest set <draft>` — promote a draft YAML into the
  canonical sidecar position. Validates the schema, checks
  cross-file references, stamps `metadata.suggestion`, and
  atomically renames the draft into place. Reads from stdin when
  the path is `-`. Refuses to use the main file as the draft.
- `/archik:*` slash commands for Claude Code: `/archik:suggest`,
  `/archik:accept`, `/archik:reject`, `/archik:describe`,
  `/archik:dev`. All are thin shims over `npx archik` so Claude
  drives diagram changes through the CLI rather than editing YAML
  by hand.
- `archik commands` — install or refresh the `/archik:*` slash
  commands in a project (or `--user` for all projects). `archik
  init` installs them automatically alongside the skill; opt out
  with `--no-commands`.
- `archik q` — agent-friendly query CLI (`describe`, `deps`,
  `dependents`, `list`, `edges`, `impact`, `stats`) with stable
  exit codes and `--json` output.
- `--json` flag on `validate`, `diff`, and `suggest show` for
  agent consumption.

### Changed
- `SKILL.md` rewritten around a CLI-only hard rule: Claude must
  not read, write, or edit any archik file directly. Queries go
  through `npx archik q`, suggestions through `npx archik suggest
  set`, validation through `npx archik validate`. Eliminates the
  prior "fall back to reading the YAML" escape hatch, which let
  the skill silently desync from the canvas.

## [0.6.21] - 2026-04-28

### Removed
- `archik check` command. The slug-and-folder heuristic was too coarse
  for diagrams that decompose more finely than directories, and the
  alternative (an explicit `sourcePath` field per node) added more
  surface than it paid back. Diagrams stay in sync with code by
  convention now, not by a CI gate.

### Fixed
- Diff missed cross-file pointer changes. `archikFile` (on nodes) and
  `fromFile` / `toFile` (on edges) are now compared, so the canvas
  suggestion overlay correctly highlights cross-file restructuring.

## [0.6.8] - 2026-04-27

### Added
- Multi-file architecture: drop YAML files into a `.archik/` folder, drill down into nested files via `archikFile`, and navigate with breadcrumbs and a file switcher.
- Cross-file edges via `fromFile` / `toFile`, with suggestion badges per file.
- In-canvas Review toggle for suggestions — accept or reject without leaving the canvas.
- URL routes (`?file=...`) so refreshes and shared links land on the right view.
- SVG and PNG export from the toolbar.
- First-run install banner with coloured `init` / `dev` / `start` / `stop` / `status` output.

### Changed
- Atomic YAML writes and hardened daemon liveness (PID-reuse defense, SSE cleanup).
- Stronger contrast between nested same-kind containers; tighter ELK edge fanning at crowded nodes.

### Fixed
- Drill-down vs cross-file navigation are now distinct, with the file switcher highlighting the active file correctly.
- `detectFormat` consults `?path=` when the URL itself has no extension, fixing stuck-loading states.
- Empty modules render as a normal card with a KIND tag instead of a blank container.

## [0.5.0] - 2026-04-27

### Added
- `route` node kind in the taxonomy, with a distinct palette colour.

### Fixed
- Edges drawn through containers no longer absorb clicks.
- Inspector now opens for entities added during suggestion review, and locks correctly while a suggestion is in flight.

## [0.4.3] - 2026-04-27

### Added
- Suggest Arch sidecar workflow expanded — Claude proposes changes via `*.suggested.yaml`, and the user reviews and accepts in-canvas (no more new tab).
- `archik diff <a> <b>` CLI command for visual and textual diffs between architecture revisions.
- Edge taxonomy expansion: gRPC, websocket, webhook, plus UML extends / composes relationships.
- Database cylinder and cloud silhouette node shapes.

### Fixed
- Stable sidecar URL — data paths now return 404 instead of `index.html`.
- Vite dev plugin mounts the suggest endpoints so dev matches production.
- Root `tsconfig` sets `jsx` so tsx + esbuild pick the automatic runtime.

## [0.3.0] - 2026-04-26

### Added
- Suggest Arch — initial sidecar workflow where Claude proposes architecture changes and the user reviews and accepts them.

## [0.2.1] - 2026-04-26

### Added
- `archik`'s own architecture YAML now lives in the repo (replacing the placeholder).

### Changed
- Cross-reference schema validation via Zod `superRefine` — catches the bug families the structural schema missed.
- Any node with children now renders as a container, not a leaf card.

### Fixed
- Server blocks cross-origin PUT to the YAML endpoint.

## [0.1.9] - 2026-04-26

### Added
- Initial release of the `archik` CLI: `init`, `validate`, `render`, `watch`, `check`, `dev`, `start` / `stop` / `status` (detached daemon), `skill`, `--version`.
- npm publishing via GitHub Actions Trusted Publishing (OIDC, no NPM_TOKEN).
- Claude skill installer — `archik init` installs the skill at `.claude/skills/archik/SKILL.md` by default.
- Container node UI: header bar, depth tinting, header padding.

### Fixed
- `stop` actually kills the dev process; identical YAML always hashes the same.
- `archik skill` finds the bundled source on installs from npm.
- Edges between nodes inside containers are drawn at the correct coordinates.

[Unreleased]: https://github.com/bacharSalleh/archik/compare/v0.7.5...HEAD
[0.7.5]: https://github.com/bacharSalleh/archik/compare/v0.7.4...v0.7.5
[0.7.4]: https://github.com/bacharSalleh/archik/compare/v0.7.3...v0.7.4
[0.7.3]: https://github.com/bacharSalleh/archik/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/bacharSalleh/archik/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/bacharSalleh/archik/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/bacharSalleh/archik/compare/v0.6.21...v0.7.0
[0.6.21]: https://github.com/bacharSalleh/archik/compare/v0.6.8...v0.6.21
[0.6.8]: https://github.com/bacharSalleh/archik/compare/v0.5.0...v0.6.8
[0.5.0]: https://github.com/bacharSalleh/archik/compare/v0.4.3...v0.5.0
[0.4.3]: https://github.com/bacharSalleh/archik/compare/v0.3.0...v0.4.3
[0.3.0]: https://github.com/bacharSalleh/archik/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/bacharSalleh/archik/compare/v0.1.9...v0.2.1
[0.1.9]: https://github.com/bacharSalleh/archik/releases/tag/v0.1.9
