import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseYaml } from "../../io/yaml.ts";
import type { ParsedOptions } from "../options.ts";
import { resolveDocPath } from "../resolveDocPath.ts";

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
  try {
    const doc = parseYaml(text);
    console.log(
      `✓ ${file} — ${doc.nodes.length} nodes, ${doc.edges.length} edges`,
    );
    return 0;
  } catch (err) {
    console.error(`✗ ${file}`);
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
