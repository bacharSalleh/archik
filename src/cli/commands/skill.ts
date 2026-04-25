import { copyFile, mkdir, stat } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { getString, type ParsedOptions } from "../options.ts";

export type SkillScope = "project" | "user";

export type InstallSkillResult =
  | { ok: true; target: string; scope: SkillScope }
  | { ok: false; reason: "exists"; target: string }
  | { ok: false; reason: "missing-source"; source: string };

export async function installSkill(args: {
  scope: SkillScope;
  force: boolean;
}): Promise<InstallSkillResult> {
  // Follow symlinks so this works under `npm link`. From src/cli/commands
  // walk up three levels to the package root.
  const here = path.dirname(realpathSync(fileURLToPath(import.meta.url)));
  const pkgRoot = path.resolve(here, "..", "..", "..");
  const source = path.join(pkgRoot, ".claude", "skills", "archik.md");

  try {
    await stat(source);
  } catch {
    return { ok: false, reason: "missing-source", source };
  }

  const targetDir =
    args.scope === "user"
      ? path.join(os.homedir(), ".claude", "skills")
      : path.resolve(".claude", "skills");
  const target = path.join(targetDir, "archik.md");

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
