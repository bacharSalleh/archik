#!/usr/bin/env node
/**
 * Production build for the published npm package.
 *
 *   1. `vite build` → dist/ui/  (static React canvas: index.html + assets)
 *   2. `esbuild`    → dist/cli/archik.mjs  (single ESM file, all deps inlined,
 *                                          minified, chokidar bundled)
 *
 * What ships in the tarball: bin/, dist/, README, LICENSE, the AI skill.
 * What does NOT ship: src/, vite/, configs, tests, the dev plugin.
 */
import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: root });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("[build] cleaning dist/");
await rm(path.join(root, "dist"), { recursive: true, force: true });
await mkdir(path.join(root, "dist"), { recursive: true });

console.log("[build] vite build → dist/ui/");
run(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vite", "build", "--mode", "production"],
);

console.log("[build] esbuild → dist/cli/archik.mjs");
await esbuild({
  entryPoints: [path.join(root, "src", "cli", "index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: path.join(root, "dist", "cli", "archik.mjs"),
  minify: true,
  sourcemap: false,
  legalComments: "none",
  // Use React's automatic JSX runtime so source files don't need a
  // top-level `import React`. Matches what Vite gives the canvas in dev.
  jsx: "automatic",
  jsxImportSource: "react",
  // Keep node built-ins external; inline everything else (chokidar,
  // elkjs, yaml, zod, etc).
  external: [],
  banner: {
    // ESM bundles can't natively use require/createRequire without help.
    // chokidar / yaml are pure ESM-friendly so this is just a safety net
    // for any transitive CJS module that calls require().
    js: [
      "import { createRequire as __archikCreateRequire } from 'node:module';",
      "const require = __archikCreateRequire(import.meta.url);",
    ].join("\n"),
  },
});

console.log("[build] done.");
