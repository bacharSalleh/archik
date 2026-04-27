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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";

const here = dirname(realpathSync(fileURLToPath(import.meta.url)));
const pkgRoot = resolve(here, "..");
const args = process.argv.slice(2);
const env = { ...process.env, ARCHIK_PKG_ROOT: pkgRoot };

const distEntry = resolve(pkgRoot, "dist", "cli", "archik.mjs");

// First-run / new-version banner. We can't reliably print on `npm
// install` itself — npm 10+ silences postinstall stdout/stderr by
// default unless --foreground-scripts is passed. So we print on
// the first archik invocation after install or upgrade, and stamp
// a marker file so the next call stays quiet. Honours NO_COLOR /
// ARCHIK_NO_BANNER and stays silent when stdout isn't a TTY.
maybePrintFirstRunBanner();

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

function maybePrintFirstRunBanner() {
  if (
    process.env["ARCHIK_NO_BANNER"] !== undefined ||
    process.env["CI"] !== undefined ||
    !process.stdout.isTTY
  ) {
    return;
  }
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(resolve(pkgRoot, "package.json"), "utf8"));
  } catch {
    return;
  }
  const version = String(pkg.version ?? "");
  if (version === "") return;

  const markerDir = join(homedir(), ".archik");
  const markerFile = join(markerDir, "last-banner-version");
  let lastSeen = "";
  try {
    lastSeen = readFileSync(markerFile, "utf8").trim();
  } catch {
    // first install — no marker yet
  }
  if (lastSeen === version) return;

  // Show the banner and persist the version. Failure to persist is
  // non-fatal — the banner just shows again next call.
  printBanner(version);
  try {
    mkdirSync(markerDir, { recursive: true });
    writeFileSync(markerFile, version + "\n");
  } catch {
    // read-only home or similar — fine
  }
}

function printBanner(version) {
  const colour = process.env["NO_COLOR"] === undefined;
  const c = (open, close) => (s) =>
    colour ? `\x1b[${open}m${s}\x1b[${close}m` : s;
  const bold = c("1", "22");
  const dim = c("2", "22");
  const cyan = c("36", "39");
  const green = c("32", "39");
  const magenta = c("35", "39");
  const line = dim("─".repeat(56));
  const tick = bold(green("✓"));
  const arrow = cyan("▸");

  process.stdout.write(
    [
      "",
      line,
      `  ${tick} ${bold(magenta("archik"))} ${dim("v" + version)} ${dim("ready")}`,
      line,
      `  ${arrow} ${bold("archik init")}   ${dim("scaffold .archik/main.archik.yaml")}`,
      `  ${arrow} ${bold("archik dev")}    ${dim("open the live canvas in your browser")}`,
      `  ${arrow} ${bold("archik --help")} ${dim("full command list")}`,
      "",
      `  ${dim("Docs: https://npmjs.com/package/archik")}`,
      "",
    ].join("\n") + "\n",
  );
}
