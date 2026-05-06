import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getString, type ParsedOptions } from "../options.ts";
import { pkgRoot } from "../paths.ts";

export type SkillScope = "project" | "user";

export type InstallSkillResult =
  | { ok: true; target: string; scope: SkillScope }
  | { ok: false; reason: "exists"; target: string }
  | { ok: false; reason: "missing-source"; source: string };

export type InstallCommandsResult =
  | { ok: true; targetDir: string; copied: string[]; scope: SkillScope }
  | { ok: false; reason: "exists"; existing: string[]; targetDir: string }
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
  // Source layout follows the Claude Code plugin convention so the
  // same files ship as both the npm install (via this installer) and
  // the Claude Code plugin (via plugin.json). See `.claude-plugin/`.
  const source = path.join(
    pkgRoot(),
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

/**
 * Install the bundled `/archik:*` slash commands into the user's
 * `.claude/commands/archik/` directory. The slash commands are pure
 * shims over the `npx archik` CLI; their job is to give the user a
 * one-keystroke way to trigger the CLI-mediated workflow Claude
 * follows under the skill.
 *
 * Source layout (in this package): `commands/*.md` — flat, the
 * Claude Code plugin convention. The plugin name (`archik`, declared
 * in `.claude-plugin/plugin.json`) handles the `/archik:*` namespace
 * for plugin installs; this installer prefixes the same files into a
 * `commands/archik/` subdirectory for the npm-init code path so the
 * effective slash command names match either way.
 *
 * Target layout (project): `<scope>/.claude/commands/archik/*.md`
 */
export async function installCommands(args: {
  scope: SkillScope;
  force: boolean;
}): Promise<InstallCommandsResult> {
  const sourceDir = path.join(pkgRoot(), "commands");
  let entries: string[];
  try {
    entries = (await readdir(sourceDir)).filter((f) => f.endsWith(".md"));
  } catch {
    return { ok: false, reason: "missing-source", source: sourceDir };
  }
  if (entries.length === 0) {
    return { ok: false, reason: "missing-source", source: sourceDir };
  }

  const commandsBase =
    args.scope === "user"
      ? path.join(os.homedir(), ".claude", "commands")
      : path.resolve(".claude", "commands");
  const targetDir = path.join(commandsBase, "archik");

  // Without --force, refuse if any of the target files already exist.
  // Reporting which ones lets the user decide whether to overwrite
  // selectively (by deleting first) or pass --force.
  if (!args.force) {
    const existing: string[] = [];
    for (const file of entries) {
      try {
        await stat(path.join(targetDir, file));
        existing.push(file);
      } catch {
        // missing — fine
      }
    }
    if (existing.length > 0) {
      return { ok: false, reason: "exists", existing, targetDir };
    }
  }

  await mkdir(targetDir, { recursive: true });
  const copied: string[] = [];
  for (const file of entries) {
    await copyFile(
      path.join(sourceDir, file),
      path.join(targetDir, file),
    );
    copied.push(file);
  }
  return { ok: true, targetDir, copied, scope: args.scope };
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
