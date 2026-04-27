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

[Unreleased]: https://github.com/bacharSalleh/archik/compare/v0.6.8...HEAD
[0.6.8]: https://github.com/bacharSalleh/archik/compare/v0.5.0...v0.6.8
[0.5.0]: https://github.com/bacharSalleh/archik/compare/v0.4.3...v0.5.0
[0.4.3]: https://github.com/bacharSalleh/archik/compare/v0.3.0...v0.4.3
[0.3.0]: https://github.com/bacharSalleh/archik/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/bacharSalleh/archik/compare/v0.1.9...v0.2.1
[0.1.9]: https://github.com/bacharSalleh/archik/releases/tag/v0.1.9
