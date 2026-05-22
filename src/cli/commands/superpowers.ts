import path from "node:path";
import { getString, type ParsedOptions } from "../options.ts";
import { detectSuperpowers, SUPERPOWERS_INSTALL_ID } from "../superpowers.ts";
import {
  installSuperpowersOverlay,
  SUPERPOWERS_REFERENCE,
} from "./skill.ts";

/**
 * `archik superpowers [--force]` — install the superpowers overlay into
 * `.archik/SUPERPOWERS.md`, mapping each loop phase to a superpowers skill.
 * Opted into via `archik init`; this command lets users add it later or
 * refresh it. Warns (but succeeds) if the superpowers plugin isn't installed.
 */
export async function superpowersCommand(opts: ParsedOptions): Promise<number> {
  const force = getString(opts, "force") === "true";
  const result = await installSuperpowersOverlay({ force });
  if (!result.ok) {
    if (result.reason === "missing-source") {
      console.error(`✗ Superpowers template not found at ${result.source}`);
    } else {
      console.error(`✗ ${result.target} already exists. Pass --force to overwrite.`);
    }
    return 1;
  }
  const rel = path.relative(process.cwd(), result.target) || result.target;
  console.log(`✓ Installed superpowers overlay → ${rel}`);
  console.log(`  Reference it from CLAUDE.md with: ${SUPERPOWERS_REFERENCE}`);
  if (!(await detectSuperpowers())) {
    console.log(
      `! superpowers plugin not detected — install: /plugin install ${SUPERPOWERS_INSTALL_ID}`,
    );
  }
  return 0;
}
