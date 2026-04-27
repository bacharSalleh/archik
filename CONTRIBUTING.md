# Contributing to archik

archik is a JSON-native architecture diagram tool. The YAML file is
the source of truth, the canvas is a stateless projection, and Claude
Code can edit the same file you do. Contributions welcome — read this
before opening a PR.

## Quick start

```bash
git clone git@github.com:bacharSalleh/archik.git
cd archik
npm install
npm run dev          # Vite at http://localhost:5173 — dogfoods .archik/main.archik.yaml
```

## Project layout

- `src/cli/` — CLI commands (`init`, `dev`, `start`, `stop`, `status`, `validate`, `render`, `diff`, `suggest`, `skill`, `check`, `watch`).
- `src/server/` — node:http dev server + the shared HTTP handler module mounted by both standalone and Vite plugin paths.
- `src/render/` — React + SVG renderer. Per-shape components, edge styling, diff overlay primitives.
- `src/layout/` — ELK adapter. Computes positions, edge routes, container padding.
- `src/domain/` — Pure domain: Zod schema, taxonomy, command operations, diff. No React, no I/O.
- `src/io/` — YAML/JSON parsers, exporters, browser fetch/save adapters, canvas SVG/PNG export.
- `src/ui/` — Canvas React app: App, Toolbar, Inspectors, Breadcrumbs, FileSwitcher, ExportMenu.
- `vite/` — Vite plugin (`archikWatch`) used in dev. Mounts the same handlers as the standalone server.
- `bin/archik.js` — CLI entry point. Switches between the bundled `dist/cli/archik.mjs` and an in-repo `tsx` fallback.
- `.archik/main.archik.yaml` — this project's own architecture (we dogfood the tool).
- `.claude/skills/archik/SKILL.md` — the skill installed into user projects so Claude understands the format.

## Verifying changes

```bash
npm run typecheck                 # tsc -b --noEmit
npm test                          # vitest run
node bin/archik.js validate       # check the YAML cross-refs
node bin/archik.js render --out /tmp/preview.svg
```

The bin script prefers the bundled `dist/cli/archik.mjs` when present
and falls back to `tsx` against `src/` when it isn't. While iterating
on CLI code, delete `dist/` (or just don't build) so your edits take
effect immediately.

## The architecture file rule

Any change that adds, removes, renames, or rewires a node or edge in
this project's component graph should be reflected in
`.archik/main.archik.yaml`. After editing, run:

```bash
node bin/archik.js validate
```

The Zod schema enforces cross-references (no dangling edges, no
parent cycles, no duplicate ids). The Claude skill at
`.claude/skills/archik/SKILL.md` is what teaches AI contributors this
rule — humans should follow the same one.

## Commit & PR conventions

- **Conventional commits**: `feat:`, `fix:`, `docs:`, `chore:`,
  `refactor:`, `style:`, `test:`. Optionally scoped:
  `feat(canvas): …`, `fix(server): …`.
- **One logical change per PR.** If you find an unrelated bug along
  the way, file an issue or split into a separate PR.
- **PR title in imperative mood**: "fix sidecar 404 on .yml extension"
  not "fixed".
- **Run the test plan before opening.** The PR template lists what to
  check; actually do it.

## Reporting issues

- **Bugs**: use the bug report issue template. Include the version
  (`archik --version`), the OS, and a minimal repro.
- **Features**: use the feature request template. Concrete proposals
  with example YAML or mocks are easier to act on than open-ended
  ideas.
- **Security vulnerabilities**: do **not** open a public issue. See
  [SECURITY.md](./SECURITY.md) for the private disclosure flow.

## License

By contributing you agree that your contributions are licensed under
the [MIT License](./LICENSE), the same license as the rest of the
project.
