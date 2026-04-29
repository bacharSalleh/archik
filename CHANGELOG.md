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

## [0.7.2] - 2026-04-29

### Added
- `/archik:spawn` and `/archik:evolve` slash commands now pipe the
  proposed YAML through stdin to `npx archik suggest set -` via a
  heredoc, instead of writing a temp file under `/tmp/`. Same goes
  for `/archik:suggest`. Eliminates a class of permission /
  path-resolution failures and the symptom where Claude could leak
  a `/tmp/` path into a canvas URL.

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

[Unreleased]: https://github.com/bacharSalleh/archik/compare/v0.7.2...HEAD
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
