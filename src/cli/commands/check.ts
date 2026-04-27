import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseYaml } from "../../io/yaml.ts";
import type { NodeKind } from "../../domain/types.ts";
import type { ParsedOptions } from "../options.ts";
import { projectRoot, resolveDocPath } from "../resolveDocPath.ts";

/**
 * Kinds we DO expect to find in source. Skip pure-data infra and
 * external boundaries — there's no source folder for "the Stripe API"
 * or "Kafka topic".
 */
const SOURCEABLE_KINDS = new Set<NodeKind>([
  "service",
  "function",
  "worker",
  "agent",
  "frontend",
  "gateway",
  "tool",
  "module",
]);

const CANDIDATE_PARENTS = ["src", "services", "packages", "apps"];

async function collectChildDirs(parent: string): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const entries = await readdir(parent, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) out.add(entry.name);
    }
  } catch {
    // parent doesn't exist or unreadable — return empty
  }
  return out;
}

function nameSlugs(name: string): string[] {
  const lower = name.toLowerCase();
  return [
    lower,
    lower.replace(/\s+/g, "-"),
    lower.replace(/\s+/g, "_"),
    lower.replace(/\s+/g, ""),
  ];
}

export async function checkCommand(opts: ParsedOptions): Promise<number> {
  let abs: string;
  try {
    abs = await resolveDocPath(opts._[0]);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const file = path.relative(process.cwd(), abs) || abs;
  const baseDir = projectRoot(abs);

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

  // Build the set of immediate-child dir names under each candidate parent.
  const allDirs = new Set<string>();
  for (const parent of CANDIDATE_PARENTS) {
    const dirs = await collectChildDirs(path.join(baseDir, parent));
    for (const d of dirs) allDirs.add(d.toLowerCase());
  }

  const issues: string[] = [];
  for (const node of doc.nodes) {
    if (!SOURCEABLE_KINDS.has(node.kind)) continue;
    const candidates = [node.id.toLowerCase(), ...nameSlugs(node.name)];
    if (!candidates.some((c) => allDirs.has(c))) {
      issues.push(
        `  ⚠ ${node.kind.padEnd(8)} ${node.id.padEnd(16)} "${node.name}" — no matching directory under ${CANDIDATE_PARENTS.join(", ")}`,
      );
    }
  }

  if (issues.length === 0) {
    console.log(`✓ ${file} — every sourceable node has a matching directory`);
    return 0;
  }
  console.log(`Drift in ${file}:`);
  for (const issue of issues) console.log(issue);
  console.log(
    `\n${issues.length} node${issues.length === 1 ? "" : "s"} without a source directory.`,
  );
  return 1;
}
