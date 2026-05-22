import path from "node:path";
import { getString, type ParsedOptions } from "../options.ts";
import { isInteractive, selectFromList } from "../prompts.ts";
import {
  installPrinciples,
  PRINCIPLES_REFERENCE,
  type Paradigm,
} from "./skill.ts";

/**
 * `archik principles [oop|functional] [--force]` — install the chosen
 * coding-principles template into `.archik/PRINCIPLES.md`. Installed by
 * `archik init` (via the paradigm prompt) and refreshed in place by
 * `archik upgrade`; this command lets users add or switch paradigms later.
 */
export async function principlesCommand(opts: ParsedOptions): Promise<number> {
  const force = getString(opts, "force") === "true";
  const arg = (opts._[0] as string | undefined)?.toLowerCase();

  let paradigm: Paradigm;
  if (arg === "oop" || arg === "functional") {
    paradigm = arg;
  } else if (arg !== undefined) {
    console.error(`✗ Unknown paradigm "${arg}". Use "oop" or "functional".`);
    return 1;
  } else if (isInteractive()) {
    paradigm = await selectFromList<Paradigm>(
      "Which coding principles should Claude follow for this project?",
      [
        { value: "oop", label: "OOP", hint: "separation of concerns, composition, design patterns, clean code" },
        { value: "functional", label: "Functional", hint: "purity, immutability, composition, effects at the edges" },
      ],
    );
  } else {
    console.error("✗ Specify a paradigm: archik principles oop|functional");
    return 1;
  }

  const result = await installPrinciples({ paradigm, force });
  if (!result.ok) {
    if (result.reason === "missing-source") {
      console.error(`✗ Principles template not found at ${result.source}`);
    } else {
      console.error(`✗ ${result.target} already exists. Pass --force to overwrite.`);
    }
    return 1;
  }
  const rel = path.relative(process.cwd(), result.target) || result.target;
  console.log(`✓ Installed ${paradigm.toUpperCase()} principles → ${rel}`);
  console.log(`  Reference it from CLAUDE.md with: ${PRINCIPLES_REFERENCE}`);
  return 0;
}
