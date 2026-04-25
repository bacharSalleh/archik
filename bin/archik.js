#!/usr/bin/env node
/**
 * Global entry point. Resolves Archik's package root even through
 * symlinks (npm link / pnpm link), then spawns tsx against the CLI
 * source so .ts files run directly without a separate build step.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

const here = dirname(realpathSync(fileURLToPath(import.meta.url)));
const pkgRoot = resolve(here, "..");

const tsxBin = resolve(
  pkgRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);
const cliEntry = resolve(pkgRoot, "src", "cli", "index.ts");
const tsconfig = resolve(pkgRoot, "tsconfig.app.json");

const result = spawnSync(
  tsxBin,
  ["--tsconfig", tsconfig, cliEntry, ...process.argv.slice(2)],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
