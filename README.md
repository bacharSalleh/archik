# Archik

A JSON-native architecture diagram tool. The YAML file is the source of
truth; the canvas is a stateless projection of it. Both humans and LLMs
edit the same file. Layout is computed by ELK; coordinates never appear
in the YAML.

## Install once, use in every project

Inside this repo:

```bash
npm install
npm link        # exposes the `archik` binary on your PATH
```

`npm link` creates a symlink from your global node binaries to
`bin/archik.js` in this directory. The bin script resolves through the
symlink (via `realpath`), spawns `tsx` against `src/cli/index.ts`, and
runs the CLI without a separate build step.

If you ever want to remove it:

```bash
npm unlink -g archik
```

## Per-project workflow

The YAML lives in your target project, not here. From any project
directory:

```bash
cd ~/projects/my-app
archik init             # only the first time — scaffolds architecture.archik.yaml
archik dev              # opens the live canvas in your browser
```

`archik dev` starts the Vite dev server from Archik's install dir, but
points it at the current working directory's `architecture.archik.yaml`
via the `ARCHIK_DOC_PATH` env var. The browser canvas loads, the file
watcher sees your edits, the inspector saves back to your project's
file. Nothing about Archik lives inside your project.

## All commands

```
archik init              Scaffold a starter architecture.archik.yaml
archik dev [path]        Open the canvas in your browser (live editor)
                         --port <n>       dev server port
                         --host <addr>    bind to host
                         --no-open        don't auto-open the browser
archik validate [path]   Validate a document against the schema
archik render [path]     Render to a self-contained SVG file
                         --out <file>     output path (default: diagram.svg)
                         --theme <name>   "dark" (default) or "light"
archik watch [path]      Re-render to SVG on file changes
archik check [path]      Drift detection — flag nodes without source dirs
```

Default path is `architecture.archik.yaml` in the current directory.

## CI usage

```bash
# Fail the build if the diagram has schema errors:
archik validate

# Generate an SVG of your architecture for the docs:
archik render --theme light --out docs/architecture.svg

# Compare nodes to source dirs and warn about drift:
archik check
```

## Directory layout (this repo)

```
src/
  domain/      Pure schema + commands (no React, no ELK)
  layout/      ELK adapter behind a LayoutEngine interface
  render/      Pure SVG renderer (DiagramSvg, per-kind shapes, edges)
  io/          YAML/JSON, exporters, file adapter, live-reload
  ui/          React app — toolbar, inspectors, modals, popovers
  cli/         The `archik` binary you just installed
vite/          Vite plugin that watches + serves the YAML over HTTP/WS
.claude/skills/  archik.md — schema + patterns for AI editors
```

## For AI editors

`.claude/skills/archik.md` documents the schema, all 26 node kinds, all
12 relationships, common editing patterns, and the verification
workflow. Claude Code in this repo (or any project that copies the
skill) gets the right vocabulary automatically.
