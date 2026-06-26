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
import { readdirSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function findFile(dir, name) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { const hit = findFile(full, name); if (hit) return hit; }
    else if (e.name === name) return full;
  }
  return null;
}

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

console.log("[build] esbuild → dist/trace.js");
await esbuild({
  entryPoints: [path.join(root, "src", "trace", "recorder.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: path.join(root, "dist", "trace.js"),
  minify: false,
  sourcemap: false,
  legalComments: "none",
  external: [],
});

console.log("[build] tsc → dist/trace.d.ts");
const tracetypesDir = path.join(root, "dist", ".tracetypes");
// Write a minimal tsconfig so tsc knows about @types/node without loading
// the project tsconfig (which has noEmit:true and breaks declaration emit).
const { writeFileSync } = await import("node:fs");
const tempTsconfig = path.join(root, ".tsconfig.trace.tmp.json");
writeFileSync(tempTsconfig, JSON.stringify({
  compilerOptions: {
    target: "ES2022",
    module: "esnext",
    moduleResolution: "bundler",
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    declaration: true,
    emitDeclarationOnly: true,
    skipLibCheck: true,
    strict: true,
    rootDir: "src",
    types: ["node"],
    outDir: tracetypesDir,
  },
  include: ["src/trace/recorder.ts"],
}), "utf-8");
run(process.platform === "win32" ? "npx.cmd" : "npx", [
  "tsc",
  "--project", tempTsconfig,
]);
await rm(tempTsconfig, { force: true });
// tsc path depends on rootDir inference — find wherever recorder.d.ts landed
const foundPath = findFile(tracetypesDir, "recorder.d.ts");
if (!foundPath) {
  console.error("[build] ERROR: tsc did not emit recorder.d.ts");
  process.exit(1);
}
console.log(`[build] found recorder.d.ts at: ${foundPath}`);
await rm(path.join(root, "dist", "trace.d.ts"), { force: true });
const { rename } = await import("node:fs/promises");
await rename(foundPath, path.join(root, "dist", "trace.d.ts"));
await rm(tracetypesDir, { recursive: true, force: true });

console.log("[build] done.");
