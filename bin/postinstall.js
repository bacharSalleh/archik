#!/usr/bin/env node
/**
 * Friendly post-install banner. npm 10+ stopped echoing the package
 * version ("added 1 package in 3s" is all the user sees), so this
 * gives them a confirmation, the version they got, and where to go
 * next. Stays quiet under CI / non-TTY / inside a parent npm install
 * so it doesn't pollute logs.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Skip when noise would hurt more than help.
if (
  process.env["CI"] !== undefined ||
  process.env["ARCHIK_NO_BANNER"] !== undefined ||
  !process.stdout.isTTY ||
  // Inside `npm install` / yarn / pnpm of a host project — only
  // show the banner for global installs and direct local installs.
  process.env["npm_config_global"] !== "true" &&
    process.env["npm_command"] === "install" &&
    process.env["npm_config_save"] !== undefined
) {
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(here, "..", "package.json"), "utf8"),
);

const enabled = process.env["NO_COLOR"] === undefined;
const c = (open, close) => (s) =>
  enabled ? `\x1b[${open}m${s}\x1b[${close}m` : s;
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
    `  ${tick} ${bold(magenta("archik"))} ${dim("v" + pkg.version)} ${dim("installed")}`,
    line,
    `  ${arrow} ${bold("archik init")}   ${dim("scaffold .archik/main.archik.yaml")}`,
    `  ${arrow} ${bold("archik dev")}    ${dim("open the live canvas in your browser")}`,
    `  ${arrow} ${bold("archik --help")} ${dim("full command list")}`,
    "",
    `  ${dim("Docs: https://npmjs.com/package/archik")}`,
    "",
  ].join("\n"),
);
