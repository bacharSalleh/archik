import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { checkCrossFileReferences, formatErrors } from "../../domain/validate.ts";
import { parseYaml } from "../../io/yaml.ts";
import type { ParsedOptions } from "../options.ts";
import { projectRoot, resolveDocPath } from "../resolveDocPath.ts";

export async function validateCommand(
  opts: ParsedOptions,
): Promise<number> {
  let abs: string;
  try {
    abs = await resolveDocPath(opts._[0]);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const file = path.relative(process.cwd(), abs) || abs;
  let text: string;
  try {
    text = await readFile(abs, "utf-8");
  } catch (err) {
    console.error(`✗ Cannot read ${file}`);
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
  let doc;
  try {
    doc = parseYaml(text);
  } catch (err) {
    console.error(`✗ ${file}`);
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  // Cross-file references (archikFile / fromFile / toFile) are
  // resolved by the dev server against the project root — same root
  // we derive here. A typo like `agent-loop.archik.yaml` (missing the
  // `.archik/` prefix) parses fine against the schema but 404s in the
  // canvas the moment the user drills in, so catch it at validate time.
  const root = projectRoot(abs);
  const crossFileErrors = checkCrossFileReferences(doc, (rel) =>
    existsSync(path.resolve(root, rel)),
  );
  if (crossFileErrors.length > 0) {
    console.error(`✗ ${file}`);
    console.error(formatErrors(crossFileErrors));
    return 1;
  }

  console.log(
    `✓ ${file} — ${doc.nodes.length} nodes, ${doc.edges.length} edges`,
  );
  return 0;
}
