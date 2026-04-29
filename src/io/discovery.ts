/**
 * Walk a project for every archik document. The root file (whichever
 * `resolveDocPath` picks) plus every `*.archik.yaml` under `.archik/`,
 * recursive but depth-bounded so a pathological symlink tree can't
 * trap us. Suggestion sidecars (`*.archik.suggested.yaml`) are skipped
 * — they're proposals, not truth.
 *
 * Pure I/O helper, no schema knowledge. The caller decides what to do
 * with parsed docs (validate, query, diff, …).
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseYaml } from "./yaml.ts";
import type { Document } from "../domain/types.ts";

const MAX_DEPTH = 6;

export type LoadedDoc = {
  /** Absolute path on disk. */
  abs: string;
  /** Path relative to the project root, with forward slashes — what
   *  agents and humans see in command output. */
  relPath: string;
  doc: Document;
};

export type DiscoveryResult = {
  docs: LoadedDoc[];
  /** Files we tried to load but couldn't parse — surfaced as warnings
   *  rather than aborts so a single broken sidecar doesn't blind the
   *  whole project. The CLI may choose to print them. */
  errors: Array<{ abs: string; relPath: string; message: string }>;
};

function relFromRoot(projectBase: string, abs: string): string {
  return path.relative(projectBase, abs).split(path.sep).join("/") ||
    path.basename(abs);
}

function isArchikYaml(name: string): boolean {
  return (
    name.endsWith(".archik.yaml") &&
    !name.endsWith(".archik.suggested.yaml")
  );
}

export async function discoverDocs(
  rootDocPath: string,
  projectBase: string,
): Promise<DiscoveryResult> {
  const docs: LoadedDoc[] = [];
  const errors: DiscoveryResult["errors"] = [];
  const seen = new Set<string>();

  const tryLoad = async (abs: string): Promise<void> => {
    if (seen.has(abs)) return;
    seen.add(abs);
    let text: string;
    try {
      text = await readFile(abs, "utf-8");
    } catch (err) {
      errors.push({
        abs,
        relPath: relFromRoot(projectBase, abs),
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    try {
      const doc = parseYaml(text);
      docs.push({ abs, relPath: relFromRoot(projectBase, abs), doc });
    } catch (err) {
      errors.push({
        abs,
        relPath: relFromRoot(projectBase, abs),
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  await tryLoad(rootDocPath);

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) return;
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
      if (e.isFile() && isArchikYaml(e.name)) {
        await tryLoad(full);
      }
    }
  };
  await walk(path.join(projectBase, ".archik"), 0);

  return { docs, errors };
}
