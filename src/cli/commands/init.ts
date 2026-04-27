import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getString, type ParsedOptions } from "../options.ts";
import { resolveInitTarget } from "../resolveDocPath.ts";
import { installSkill, type InstallSkillResult } from "./skill.ts";

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
    console.error(`✗ ${file} already exists. Refusing to overwrite.`);
    return 1;
  } catch {
    // file doesn't exist; proceed
  }
  // The new convention is `.archik/main.archik.yaml`, so make sure
  // the parent directory exists. Harmless for the legacy root layout.
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, STARTER, "utf-8");
  console.log(`✓ Created ${file}`);

  // Skill is installed by default — opt out with --no-skill. Failure to
  // install isn't fatal (the YAML is still useful on its own); we just
  // surface the reason and keep going.
  let skillResult: InstallSkillResult | null = null;
  if (getString(opts, "no-skill") !== "true") {
    skillResult = await installSkill({ scope: "project", force: false });
    if (skillResult.ok) {
      console.log(`✓ Installed Claude skill → ${skillResult.target}`);
    } else if (skillResult.reason === "exists") {
      console.log(
        `• Claude skill already present at ${skillResult.target} (refresh with \`archik skill --force\`)`,
      );
    } else {
      console.error(
        `✗ Skill source missing at ${skillResult.source} — continuing without it.`,
      );
    }
  }

  printNextSteps(file, skillResult);
  return 0;
}

function printNextSteps(
  file: string,
  skill: InstallSkillResult | null,
): void {
  const skillInstalled =
    skill !== null && (skill.ok || skill.reason === "exists");
  console.log("");
  console.log("Next:");
  console.log(`  archik start              # open the live canvas`);
  console.log(`  archik validate           # check the YAML for CI`);
  console.log(`  archik render --out arch.svg --theme light`);

  if (skillInstalled) {
    console.log("");
    console.log(
      "Try this in Claude Code (the skill is already wired up):",
    );
    console.log("");
    console.log(
      `  Read ${file} then scan this codebase and propose 3-5`,
    );
    console.log(
      `  nodes / edges that better capture the actual structure.`,
    );
    console.log(
      `  Update the YAML and run \`archik validate\` to confirm.`,
    );
    console.log("");
  } else {
    console.log("");
    console.log(
      `Want Claude to edit this file alongside you? Run \`archik skill\``,
    );
    console.log(`to install the AI skill into ./.claude/skills.`);
    console.log("");
  }
}
