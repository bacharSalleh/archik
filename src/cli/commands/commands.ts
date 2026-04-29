import { getString, type ParsedOptions } from "../options.ts";
import { installCommands, type SkillScope } from "./skill.ts";

/**
 * `archik commands [--user] [--force]` — install the bundled
 * `/archik:*` slash commands into a project (or user-wide). Mirrors
 * `archik skill` so existing installs from before this feature
 * shipped can opt in without re-running `init`.
 */
export async function commandsCommand(opts: ParsedOptions): Promise<number> {
  const scope: SkillScope =
    getString(opts, "user") === "true" ? "user" : "project";
  const force = getString(opts, "force") === "true";
  const result = await installCommands({ scope, force });
  if (!result.ok) {
    if (result.reason === "missing-source") {
      console.error(`✗ Source commands not found at ${result.source}`);
    } else {
      console.error(
        `✗ ${result.targetDir} already has ${result.existing.join(", ")}. Pass --force to overwrite.`,
      );
    }
    return 1;
  }
  const label = result.scope === "user" ? "user-wide" : "this project";
  console.log(
    `✓ Installed ${result.copied.length} archik slash commands (${label}) → ${result.targetDir}`,
  );
  for (const file of result.copied) {
    console.log(`  • /archik:${file.replace(/\.md$/, "")}`);
  }
  return 0;
}
