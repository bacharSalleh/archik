import { copyFile, mkdir, stat } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { getString, type ParsedOptions } from "../options.ts";

export async function skillCommand(opts: ParsedOptions): Promise<number> {
  // Follow symlinks so this works under `npm link`. From src/cli/commands
  // walk up three levels to the package root.
  const here = path.dirname(realpathSync(fileURLToPath(import.meta.url)));
  const pkgRoot = path.resolve(here, "..", "..", "..");
  const source = path.join(pkgRoot, ".claude", "skills", "archik.md");

  try {
    await stat(source);
  } catch {
    console.error(`✗ Source skill not found at ${source}`);
    return 1;
  }

  const userScope = getString(opts, "user") === "true";
  const force = getString(opts, "force") === "true";
  const home = os.homedir();
  const targetDir = userScope
    ? path.join(home, ".claude", "skills")
    : path.resolve(".claude", "skills");
  const target = path.join(targetDir, "archik.md");

  let exists = false;
  try {
    await stat(target);
    exists = true;
  } catch {
    // missing — fine
  }
  if (exists && !force) {
    console.error(
      `✗ ${target} already exists. Pass --force to overwrite.`,
    );
    return 1;
  }

  await mkdir(targetDir, { recursive: true });
  await copyFile(source, target);
  const scope = userScope ? "user-wide" : "this project";
  console.log(`✓ Installed archik skill (${scope}) → ${target}`);
  return 0;
}
