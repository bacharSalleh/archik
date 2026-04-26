#!/usr/bin/env node
/**
 * Global entry point. Resolves the package root through symlinks
 * (npm link / pnpm link), then dispatches to one of two backends:
 *
 *   * Production install (`npm install archik`): runs the pre-built
 *     ESM bundle at `dist/cli/archik.mjs` directly with node — no
 *     TypeScript, no tsx, no source files.
 *   * In-repo development (this checkout, before `npm run build`):
 *     falls back to spawning `tsx` against `src/cli/index.ts`.
 *
 * Either way, ARCHIK_PKG_ROOT is set so the CLI doesn't have to guess
 * where its install lives.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, realpathSync } from "node:fs";

const here = dirname(realpathSync(fileURLToPath(import.meta.url)));
const pkgRoot = resolve(here, "..");
const args = process.argv.slice(2);
const env = { ...process.env, ARCHIK_PKG_ROOT: pkgRoot };

const distEntry = resolve(pkgRoot, "dist", "cli", "archik.mjs");

let result;
if (existsSync(distEntry)) {
  result = spawnSync(process.execPath, [distEntry, ...args], {
    stdio: "inherit",
    env,
  });
} else {
  const tsxBin = resolve(
    pkgRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx",
  );
  if (!existsSync(tsxBin)) {
    console.error(
      "archik: no built bundle and no tsx fallback available.\n" +
        `  Looked for: ${distEntry}\n` +
        `         and: ${tsxBin}\n` +
        "  Run `npm install` and `npm run build` from the archik checkout.",
    );
    process.exit(1);
  }
  const cliEntry = resolve(pkgRoot, "src", "cli", "index.ts");
  const tsconfig = resolve(pkgRoot, "tsconfig.app.json");
  result = spawnSync(
    tsxBin,
    ["--tsconfig", tsconfig, cliEntry, ...args],
    { stdio: "inherit", env },
  );
}

process.exit(result.status ?? 1);
