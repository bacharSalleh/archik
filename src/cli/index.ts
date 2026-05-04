#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { initCommand } from "./commands/init.ts";
import { validateCommand } from "./commands/validate.ts";
import { renderCommand } from "./commands/render.ts";
import { schemaCommand } from "./commands/schema.ts";
import { watchCommand } from "./commands/watch.ts";
import { qCommand } from "./commands/q.ts";
import { devCommand } from "./commands/dev.ts";
import { commandsCommand } from "./commands/commands.ts";
import { skillCommand } from "./commands/skill.ts";
import { COMMAND_HELP } from "./help.ts";
import { startCommand } from "./commands/start.ts";
import { stopCommand } from "./commands/stop.ts";
import { statusCommand } from "./commands/status.ts";
import { diffCommand } from "./commands/diff.ts";
import { suggestCommand } from "./commands/suggest.ts";
import { driftCommand } from "./commands/drift.ts";
import { traceCommand } from "./commands/trace.ts";
import { alphaCommand } from "./commands/alpha.ts";
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
  init              Scaffold a starter .archik/main.archik.yaml
                                     (also installs the Claude skill + slash commands by default)
                    --no-skill       skip installing the Claude skill
                    --no-commands    skip installing the /archik:* slash commands
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
                    --json           structured output for agents
  render [path]     Render the diagram to an SVG file
                    --out <file>     output path (default: diagram.svg)
                    --theme <name>   "dark" (default) or "light"
  watch [path]      Re-render to SVG on file changes (Ctrl+C to stop)
  q <sub>           Query the diagram (agent-friendly, --json supported)
                    describe <id>      node + its incoming/outgoing edges
                    deps <id>          outgoing edges
                    dependents <id>    incoming edges
                    list               all nodes (--kind / --parent / --file)
                    edges              all edges (--from / --to / --rel)
                    impact <id>        what would break if removed
                    stats              counts by kind and relationship
  schema            Print the document schema (kinds, relationships, fields)
                    --json           structured shape for agents
  diff <a> <b>      Show what changed between two architecture YAMLs
                    --out <file>     also write a colour-coded SVG diff
                    --theme <name>   "dark" (default) or "light"
                    --json           structured diff output for agents
  suggest [sub]     Manage Claude's pending architecture suggestion
                    show             summarise the pending sidecar (default)
                                     --json   structured output for agents
                    set <draft>      validate a draft YAML and stage it as
                                     the sidecar (use "-" to read stdin)
                                     --note '<one-liner>'  set metadata.suggestion.note
                                     --main <path>          override main file detection
                                     --json                 structured output for agents
                    accept           apply the sidecar over the main file
                    reject           discard the sidecar
  drift [path]      Detect when the diagram diverges from source code
                    --json           structured output for agents
                    --ignore <file>  custom ignore file (default: .archik/.driftignore)
  trace             Use case x slice x test x seq x node coverage matrix
                    --use-case <id>  filter to one use case
                    --actor <id>     filter to use cases involving an actor
                    --status <s>     filter slices by status
                    --coverage <l>   filter rows by coverage (full/partial/none)
                    --fail-on <l>    exit 1 if any row meets that level (partial or none)
                    --json           structured output for agents
  alpha <sub>       Essence alpha state tracker (Stakeholders, Requirements,
                                     Software System, Work)
                    show             render claimed states + verification badges
                    promote <a> <s>  walk UP the ladder; runs machine check
                                     --note '<text>'  attach a note
                    demote <a> <s>   walk DOWN the ladder (no check)
  skill             Install the Archik skill for Claude
                    --user           install to ~/.claude/skills (all projects)
                    --force          overwrite if it already exists
  commands          Install the /archik:* slash commands for Claude Code
                    --user           install to ~/.claude/commands (all projects)
                    --force          overwrite if any already exist

Default file resolution (when no [path] is given):
  1. .archik/main.archik.yaml      (preferred new convention)
  2. architecture.archik.yaml      (legacy root location, still supported)
`);
}

function wantsHelp(rest: string[]): boolean {
  return rest.includes("--help") || rest.includes("-h");
}

async function main(): Promise<number> {
  const [, , command, ...rest] = process.argv;

  // Per-command --help: catch it before option parsing so a flag
  // misuse ("--port" without a value, etc.) doesn't override the
  // user's intent to read the help page.
  if (command !== undefined && wantsHelp(rest)) {
    const text = COMMAND_HELP[command];
    if (text !== undefined) {
      console.log(text);
      return 0;
    }
    // Unknown command + --help: fall through to global help below.
  }

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
    case "q":
      return qCommand(opts);
    case "schema":
      return schemaCommand(opts);
    case "skill":
      return skillCommand(opts);
    case "commands":
      return commandsCommand(opts);
    case "diff":
      return diffCommand(opts);
    case "suggest":
      return suggestCommand(opts);
    case "drift":
      return driftCommand(opts);
    case "trace":
      return traceCommand(opts);
    case "alpha":
      return alphaCommand(opts);
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
