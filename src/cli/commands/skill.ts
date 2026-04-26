import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getString, type ParsedOptions } from "../options.ts";
import { pkgRoot } from "../paths.ts";

export type SkillScope = "project" | "user";

export type InstallSkillResult =
  | { ok: true; target: string; scope: SkillScope }
  | { ok: false; reason: "exists"; target: string }
  | { ok: false; reason: "missing-source"; source: string };

export async function installSkill(args: {
  scope: SkillScope;
  force: boolean;
}): Promise<InstallSkillResult> {
  // pkgRoot() handles both dev (src/) and bundled (dist/cli/archik.mjs)
  // entry points; the previous walk-up-3-levels trick worked in dev but
  // overshot to `node_modules/` in the bundled install.
  //
  // Skill layout follows Claude Code convention:
  //   .claude/skills/<skill-name>/SKILL.md
  // so future skills (e.g. archik-validate) can sit alongside as
  // siblings without colliding.
  const source = path.join(
    pkgRoot(),
    ".claude",
    "skills",
    "archik",
    "SKILL.md",
  );

  try {
    await stat(source);
  } catch {
    return { ok: false, reason: "missing-source", source };
  }

  const skillsDir =
    args.scope === "user"
      ? path.join(os.homedir(), ".claude", "skills")
      : path.resolve(".claude", "skills");
  const targetDir = path.join(skillsDir, "archik");
  const target = path.join(targetDir, "SKILL.md");

  if (!args.force) {
    try {
      await stat(target);
      return { ok: false, reason: "exists", target };
    } catch {
      // missing — fine
    }
  }

  await mkdir(targetDir, { recursive: true });
  await copyFile(source, target);
  return { ok: true, target, scope: args.scope };
}

export async function skillCommand(opts: ParsedOptions): Promise<number> {
  const scope: SkillScope =
    getString(opts, "user") === "true" ? "user" : "project";
  const force = getString(opts, "force") === "true";
  const result = await installSkill({ scope, force });
  if (!result.ok) {
    if (result.reason === "missing-source") {
      console.error(`✗ Source skill not found at ${result.source}`);
    } else {
      console.error(
        `✗ ${result.target} already exists. Pass --force to overwrite.`,
      );
    }
    return 1;
  }
  const label = result.scope === "user" ? "user-wide" : "this project";
  console.log(`✓ Installed archik skill (${label}) → ${result.target}`);
  return 0;
}
