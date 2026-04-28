import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { parseYaml } from "../../io/yaml.ts";
import type { Document, NodeKind } from "../../domain/types.ts";
import type { ParsedOptions } from "../options.ts";
import { projectRoot, resolveDocPath } from "../resolveDocPath.ts";

/**
 * Kinds we'll fall back to slug-matching when a node has no explicit
 * `sourcePath`. Skip pure-data infra and external boundaries — there's
 * no source folder for "the Stripe API" or "Kafka topic".
 *
 * The fallback is best-effort: it works for projects where each node
 * neatly owns one top-level directory, and goes silent for nodes that
 * decompose more finely (a function inside a `commands/` folder, a
 * React component file inside `ui/`). Setting `sourcePath` on those
 * nodes is the recommended fix.
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
const MAX_ARCHIK_DEPTH = 6;

async function pathExists(abs: string): Promise<boolean> {
  try {
    await stat(abs);
    return true;
  } catch {
    return false;
  }
}

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

/**
 * Discover every archik document in the project: the root file plus
 * any `*.archik.yaml` under `.archik/` (recursive, depth-bounded).
 * Returns each with its project-root-relative path for nicer output.
 * Suggestion sidecars are excluded — they're proposals, not truth.
 */
async function loadAllDocs(
  rootDocPath: string,
  projectBase: string,
): Promise<Array<{ relPath: string; doc: Document }>> {
  const out: Array<{ relPath: string; doc: Document }> = [];
  const seen = new Set<string>();
  const load = async (abs: string): Promise<void> => {
    if (seen.has(abs)) return;
    seen.add(abs);
    const text = await readFile(abs, "utf-8");
    const doc = parseYaml(text);
    const rel =
      path.relative(projectBase, abs).split(path.sep).join("/") ||
      path.basename(abs);
    out.push({ relPath: rel, doc });
  };
  await load(rootDocPath);

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_ARCHIK_DEPTH) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full, depth + 1);
        continue;
      }
      if (
        e.isFile() &&
        e.name.endsWith(".archik.yaml") &&
        !e.name.endsWith(".archik.suggested.yaml")
      ) {
        try {
          await load(full);
        } catch {
          // unparseable sub-files are validate's problem, not check's.
        }
      }
    }
  };
  await walk(path.join(projectBase, ".archik"), 0);
  return out;
}

export async function checkCommand(opts: ParsedOptions): Promise<number> {
  let abs: string;
  try {
    abs = await resolveDocPath(opts._[0]);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const baseDir = projectRoot(abs);

  let docs;
  try {
    docs = await loadAllDocs(abs, baseDir);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  // Build the set of immediate-child dir names under each candidate
  // parent. We track per-parent so reverse drift can name the parent
  // in the message ("src/foo" vs "services/foo"); we also keep a
  // flat lowercased set for the slug fallback.
  const dirsByParent = new Map<string, Set<string>>();
  const allDirs = new Set<string>();
  for (const parent of CANDIDATE_PARENTS) {
    const dirs = await collectChildDirs(path.join(baseDir, parent));
    dirsByParent.set(parent, dirs);
    for (const d of dirs) allDirs.add(d.toLowerCase());
  }

  const forwardIssues: string[] = [];
  // Lowercased immediate-child dirs claimed by some node — either via
  // an explicit sourcePath that lands inside a candidate parent, or
  // via a slug-fallback match. Anything not in this set is reverse drift.
  const claimedDirs = new Set<string>();

  for (const { relPath: file, doc } of docs) {
    for (const node of doc.nodes) {
      if (node.sourcePath !== undefined) {
        const target = path.resolve(baseDir, node.sourcePath);
        if (!(await pathExists(target))) {
          forwardIssues.push(
            `  ⚠ ${node.kind.padEnd(8)} ${node.id.padEnd(22)} "${node.name}" — sourcePath "${node.sourcePath}" not found  [${file}]`,
          );
          continue;
        }
        // Claim the immediate-child dir if the path lives under a
        // candidate parent (e.g. src/cli/commands/init.ts → claims "cli").
        const parts = node.sourcePath.split("/");
        if (parts.length >= 2 && CANDIDATE_PARENTS.includes(parts[0]!)) {
          claimedDirs.add(parts[1]!.toLowerCase());
        }
        continue;
      }
      // No explicit sourcePath — fall back to the slug heuristic for
      // kinds that should map to a folder. Other kinds (database,
      // external, llm, …) intentionally have no source.
      if (!SOURCEABLE_KINDS.has(node.kind)) continue;
      const candidates = [node.id.toLowerCase(), ...nameSlugs(node.name)];
      const match = candidates.find((c) => allDirs.has(c));
      if (match === undefined) {
        forwardIssues.push(
          `  ⚠ ${node.kind.padEnd(8)} ${node.id.padEnd(22)} "${node.name}" — no matching dir under ${CANDIDATE_PARENTS.join(", ")} (add \`sourcePath\` if it lives elsewhere)  [${file}]`,
        );
      } else {
        claimedDirs.add(match);
      }
    }
  }

  // Reverse drift: a dir at the immediate-child level of a candidate
  // parent that no node claims. Either the dir's a service that
  // drifted out of the diagram, or it's noise that should set an
  // explicit sourcePath on a containing node.
  const reverseIssues: string[] = [];
  for (const [parent, dirs] of dirsByParent) {
    for (const d of [...dirs].sort()) {
      if (!claimedDirs.has(d.toLowerCase())) {
        reverseIssues.push(
          `  ⚠ dir      ${parent}/${d}${" ".repeat(Math.max(0, 22 - (parent.length + 1 + d.length)))} — no node references this directory`,
        );
      }
    }
  }

  if (forwardIssues.length === 0 && reverseIssues.length === 0) {
    console.log(
      `✓ ${docs.length} archik file${docs.length === 1 ? "" : "s"} — no drift`,
    );
    return 0;
  }

  if (forwardIssues.length > 0) {
    console.log("Drift (diagram → source):");
    for (const issue of forwardIssues) console.log(issue);
  }
  if (reverseIssues.length > 0) {
    if (forwardIssues.length > 0) console.log("");
    console.log("Drift (source → diagram):");
    for (const issue of reverseIssues) console.log(issue);
  }
  const total = forwardIssues.length + reverseIssues.length;
  console.log(`\n${total} drift entr${total === 1 ? "y" : "ies"}.`);
  return 1;
}
