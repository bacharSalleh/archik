#!/usr/bin/env node
import { initCommand } from "./commands/init.ts";
import { validateCommand } from "./commands/validate.ts";
import { renderCommand } from "./commands/render.ts";
import { watchCommand } from "./commands/watch.ts";
import { checkCommand } from "./commands/check.ts";
import { devCommand } from "./commands/dev.ts";
import { skillCommand } from "./commands/skill.ts";
import { parseOptions } from "./options.ts";

function printHelp(): void {
  console.log(`archik — JSON-native architecture diagram tool

USAGE
  archik <command> [path] [options]

COMMANDS
  init              Scaffold a starter architecture.archik.yaml
  dev [path]        Open the canvas in your browser (live editor)
                    --port <n>       dev server port
                    --host <addr>    bind to host
                    --no-open        don't auto-open the browser
  validate [path]   Validate a document against the schema
  render [path]     Render the diagram to an SVG file
                    --out <file>     output path (default: diagram.svg)
                    --theme <name>   "dark" (default) or "light"
  watch [path]      Re-render to SVG on file changes (Ctrl+C to stop)
  check [path]      Drift detection — flag nodes without source dirs
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
