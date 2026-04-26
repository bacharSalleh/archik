#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { initCommand } from "./commands/init.ts";
import { validateCommand } from "./commands/validate.ts";
import { renderCommand } from "./commands/render.ts";
import { watchCommand } from "./commands/watch.ts";
import { checkCommand } from "./commands/check.ts";
import { devCommand } from "./commands/dev.ts";
import { skillCommand } from "./commands/skill.ts";
import { startCommand } from "./commands/start.ts";
import { stopCommand } from "./commands/stop.ts";
import { statusCommand } from "./commands/status.ts";
import { diffCommand } from "./commands/diff.ts";
import { parseOptions } from "./options.ts";
import { pkgRoot } from "./paths.ts";

function readVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(pkgRoot(), "package.json"), "utf-8"),
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function printHelp(): void {
  console.log(`archik — JSON-native architecture diagram tool

USAGE
  archik <command> [path] [options]
  archik --version          Print the installed archik version
  archik --help             Show this message

COMMANDS
  init              Scaffold a starter architecture.archik.yaml
                                     (also installs the Claude skill by default)
                    --no-skill       skip installing the Claude skill
  dev [path]        Open the canvas in your browser (live editor, foreground)
                    --port <n>       dev server port
                    --host <addr>    bind to host
                    --no-open        don't auto-open the browser
  start [path]      Same as dev, but detached — returns the prompt immediately
                    --port <n>       dev server port
                    --host <addr>    bind to host
  stop [path]       Stop the background server started with 'archik start'
  status            List running archik instances (across all projects)
  validate [path]   Validate a document against the schema
  render [path]     Render the diagram to an SVG file
                    --out <file>     output path (default: diagram.svg)
                    --theme <name>   "dark" (default) or "light"
  watch [path]      Re-render to SVG on file changes (Ctrl+C to stop)
  check [path]      Drift detection — flag nodes without source dirs
  diff <a> <b>      Show what changed between two architecture YAMLs
                    --out <file>     also write a colour-coded SVG diff
                    --theme <name>   "dark" (default) or "light"
  skill             Install the Archik skill for Claude
                    --user           install to ~/.claude/skills (all projects)
                    --force          overwrite if it already exists

The default path is architecture.archik.yaml in the current directory.
`);
}

async function main(): Promise<number> {
  const [, , command, ...rest] = process.argv;
  const opts = parseOptions(rest);

  switch (command) {
    case "init":
      return initCommand(opts);
    case "dev":
      return devCommand(opts);
    case "start":
      return startCommand(opts);
    case "stop":
      return stopCommand(opts);
    case "status":
      return statusCommand(opts);
    case "validate":
      return validateCommand(opts);
    case "render":
      return renderCommand(opts);
    case "watch":
      return watchCommand(opts);
    case "check":
      return checkCommand(opts);
    case "skill":
      return skillCommand(opts);
    case "diff":
      return diffCommand(opts);
    case "--version":
    case "-v":
    case "version":
      console.log(readVersion());
      return 0;
    case undefined:
    case "--help":
    case "-h":
    case "help":
      printHelp();
      return 0;
    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
