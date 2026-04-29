import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { arrow, bold, cross, cyan, dim, gray, magenta, tick } from "../colors.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { resolveInitTarget } from "../resolveDocPath.ts";
import {
  installCommands,
  installSkill,
  type InstallCommandsResult,
  type InstallSkillResult,
} from "./skill.ts";

const STARTER = `version: "1.0"
name: My Architecture
description: Initial scaffold — edit this file to grow your diagram.
nodes:
  - id: web
    kind: frontend
    name: Web
    stack: Next.js
  - id: api
    kind: service
    name: API
    stack: Go
  - id: db
    kind: database
    name: Primary DB
    stack: Postgres
edges:
  - id: web-api
    from: web
    to: api
    relationship: http_call
    label: requests
  - id: api-db
    from: api
    to: db
    relationship: writes
`;

export async function initCommand(opts: ParsedOptions): Promise<number> {
  const abs = await resolveInitTarget(opts._[0] as string | undefined);
  const file = path.relative(process.cwd(), abs) || abs;
  try {
    await access(abs);
    console.error(`${cross()} ${bold(file)} already exists. Refusing to overwrite.`);
    return 1;
  } catch {
    // file doesn't exist; proceed
  }
  // The new convention is `.archik/main.archik.yaml`, so make sure
  // the parent directory exists. Harmless for the legacy root layout.
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, STARTER, "utf-8");
  console.log(`${tick()} Created ${bold(file)}`);

  // Skill is installed by default — opt out with --no-skill. Failure to
  // install isn't fatal (the YAML is still useful on its own); we just
  // surface the reason and keep going.
  let skillResult: InstallSkillResult | null = null;
  if (getString(opts, "no-skill") !== "true") {
    skillResult = await installSkill({ scope: "project", force: false });
    if (skillResult.ok) {
      console.log(`${tick()} Installed Claude skill → ${dim(skillResult.target)}`);
    } else if (skillResult.reason === "exists") {
      console.log(
        `${gray("•")} Claude skill already present at ${dim(skillResult.target)} ${dim("(refresh with `archik skill --force`)")}`,
      );
    } else {
      console.error(
        `${cross()} Skill source missing at ${dim(skillResult.source)} — continuing without it.`,
      );
    }
  }

  // Slash commands ship alongside the skill so `/archik:suggest` and
  // friends light up in the slash menu without a second install step.
  // Same opt-out + non-fatal failure semantics as the skill.
  let commandsResult: InstallCommandsResult | null = null;
  if (getString(opts, "no-commands") !== "true") {
    commandsResult = await installCommands({ scope: "project", force: false });
    if (commandsResult.ok) {
      console.log(
        `${tick()} Installed ${commandsResult.copied.length} slash commands → ${dim(commandsResult.targetDir)}`,
      );
    } else if (commandsResult.reason === "exists") {
      console.log(
        `${gray("•")} Slash commands already present at ${dim(commandsResult.targetDir)} ${dim("(refresh with `archik commands --force`)")}`,
      );
    } else {
      console.error(
        `${cross()} Commands source missing at ${dim(commandsResult.source)} — continuing without it.`,
      );
    }
  }

  printNextSteps(file, skillResult, commandsResult);
  return 0;
}

function printNextSteps(
  file: string,
  skill: InstallSkillResult | null,
  commands: InstallCommandsResult | null,
): void {
  const skillInstalled =
    skill !== null && (skill.ok || skill.reason === "exists");
  const commandsInstalled =
    commands !== null && (commands.ok || commands.reason === "exists");
  console.log("");
  console.log(bold("Next:"));
  console.log(`  ${arrow()} ${bold("archik start")}     ${dim("open the live canvas")}`);
  console.log(`  ${arrow()} ${bold("archik validate")}  ${dim("check the YAML for CI")}`);
  console.log(`  ${arrow()} ${bold("archik render")}    ${dim("--out arch.svg --theme light")}`);

  if (skillInstalled) {
    console.log("");
    console.log(magenta("Try this in Claude Code") + dim(" (the skill is already wired up):"));
    console.log("");
    if (commandsInstalled) {
      console.log(cyan("  /archik:spawn"));
      console.log(
        dim("    mirror your source tree as a first diagram (start here)"),
      );
      console.log("");
      console.log(cyan("  /archik:suggest add a Stripe webhook handler"));
      console.log(
        dim("    propose a specific change for review on the canvas"),
      );
    } else {
      console.log(
        cyan("  Read " + file + " then scan this codebase and propose 3-5"),
      );
      console.log(
        cyan("  nodes / edges that better capture the actual structure."),
      );
      console.log(
        cyan("  Update the YAML and run `archik validate` to confirm."),
      );
    }
    console.log("");
  } else {
    console.log("");
    console.log(
      `Want Claude to edit this file alongside you? Run ${bold("archik skill")}`,
    );
    console.log(dim(`to install the AI skill into ./.claude/skills.`));
    console.log("");
  }
}
