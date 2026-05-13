import path from "node:path";
import { getString, type ParsedOptions } from "../options.ts";
import { installEngineeringLoop } from "./skill.ts";

/**
 * `archik loop [--force]` — copy the engineering-loop template into
 * `.archik/ENGINEERING_LOOP.md`. Installed by default via `archik init`;
 * this command lets users (re)install on an existing project or refresh
 * after a manual edit.
 *
 * Note: this only copies the loop file. It does NOT touch CLAUDE.md —
 * `archik init` wires the `@.archik/ENGINEERING_LOOP.md` reference once
 * and `archik upgrade` refreshes the loop file in place, so we never
 * want to silently re-edit the user's CLAUDE.md outside of init.
 */
export async function loopCommand(opts: ParsedOptions): Promise<number> {
  const force = getString(opts, "force") === "true";
  const result = await installEngineeringLoop({ force });
  if (!result.ok) {
    if (result.reason === "missing-source") {
      console.error(`✗ Engineering-loop template not found at ${result.source}`);
    } else {
      console.error(
        `✗ ${result.target} already exists. Pass --force to overwrite.`,
      );
    }
    return 1;
  }
  const rel = path.relative(process.cwd(), result.target) || result.target;
  console.log(`✓ Installed engineering loop → ${rel}`);
  console.log(`  Reference it from CLAUDE.md with: @.archik/ENGINEERING_LOOP.md`);
  return 0;
}
