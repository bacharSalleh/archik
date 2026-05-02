import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { arrow, bold, cross, cyan, dim, gray, magenta, tick } from "../colors.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { RUNTIME_FILENAME } from "../projectState.ts";
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
  - id: gateway
    kind: gateway
    name: API Gateway
    description: Single entry point for all client traffic — routes requests to the owning service, enforces rate limits, and terminates TLS.
  - id: platform
    kind: module
    name: Platform
    description: Core application boundary — owns the bounded contexts that make up the business logic.
    status: proposed
  - id: users-service
    kind: service
    name: Users Service
    parentId: platform
    description: Identity bounded context — manages accounts, roles, authentication, and profile lifecycle.
    status: proposed
  - id: users-db
    kind: database
    name: Users DB
    description: Persisted state for the users context — accounts, credentials, and profile data.
  - id: orders-service
    kind: service
    name: Orders Service
    parentId: platform
    description: Orders bounded context — owns the order lifecycle from placement through fulfillment, enforces invariants, and emits domain events.
    status: proposed
  - id: orders-db
    kind: database
    name: Orders DB
    description: Persisted state for the orders context — orders, line items, and status history.
  - id: event-bus
    kind: stream
    name: Event Bus
    description: Asynchronous event backbone — decouples producers from consumers so services react to domain events without point-to-point coupling.
  - id: notification-worker
    kind: worker
    name: Notification Worker
    description: Background consumer — subscribes to domain events and dispatches notifications (email, push, SMS) without blocking the request path.
    status: proposed
  - id: placeholder
    kind: external
    name: Placeholder
    description: Stand-in for a real external dependency — replace with the actual third-party systems your architecture depends on.
edges:
  - id: gateway-users
    from: gateway
    to: users-service
    relationship: routes_to
    label: /users/*
  - id: gateway-orders
    from: gateway
    to: orders-service
    relationship: routes_to
    label: /orders/*
  - id: users-reads
    from: users-service
    to: users-db
    relationship: reads
  - id: users-writes
    from: users-service
    to: users-db
    relationship: writes
  - id: orders-reads
    from: orders-service
    to: orders-db
    relationship: reads
  - id: orders-writes
    from: orders-service
    to: orders-db
    relationship: writes
  - id: orders-publish
    from: orders-service
    to: event-bus
    relationship: publishes
    label: order.placed
  - id: notifications-sub
    from: notification-worker
    to: event-bus
    relationship: subscribes
    label: order.placed
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

  // Project-local `.archik/runtime.json` is per-machine ephemeral
  // state (PID, port, URL of the running dev server). If the
  // project has a .gitignore, append the runtime file so it doesn't
  // accidentally get committed. No-op when there's no .gitignore —
  // we don't create one ourselves, that's a project-level decision.
  await ensureRuntimeIgnored().catch(() => undefined);

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

/**
 * Append `.archik/runtime.json` to the project's .gitignore if one
 * exists and the entry isn't already there. Silently no-ops when no
 * .gitignore is present — creating one is a project-level decision
 * we don't make for the user.
 */
async function ensureRuntimeIgnored(): Promise<void> {
  const gitignore = path.resolve(".gitignore");
  let current: string;
  try {
    current = await readFile(gitignore, "utf-8");
  } catch {
    return; // no .gitignore — leave it alone
  }
  const target = `.archik/${RUNTIME_FILENAME}`;
  // Match either an exact line or a line preceded by `/` (some users
  // anchor patterns). Don't match commented-out lines.
  const lines = current.split(/\r?\n/);
  const already = lines.some((raw) => {
    const line = raw.trim();
    if (line.startsWith("#")) return false;
    return line === target || line === `/${target}`;
  });
  if (already) return;
  const trailing = current.endsWith("\n") ? "" : "\n";
  await writeFile(
    gitignore,
    `${current}${trailing}\n# archik per-machine runtime state\n${target}\n`,
    "utf-8",
  );
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
