/**
 * Locate + load the single project alphas file (`*.archik.alphas.yaml`).
 *
 * Convention: one file per project, conventionally named
 * `.archik/alphas.archik.alphas.yaml`. Multiple files are rejected —
 * unlike actors (where ids must be globally unique across files), the
 * alphas document is project-wide state and having two competing
 * snapshots is an authoring mistake.
 *
 * Recursive walk over `.archik/` to allow nested layout, depth-bounded
 * the same way as discoverDocs.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { AlphaDocumentSchema } from "../domain/alpha-schema.ts";
import type { AlphaDocument } from "../domain/alpha-schema.ts";

const MAX_DEPTH = 6;

export type LoadedAlphaDoc = {
  abs: string;
  relPath: string;
  doc: AlphaDocument;
};

export type AlphaDiscoveryResult = {
  /** The single resolved document, or null if none was found. */
  doc: LoadedAlphaDoc | null;
  /** Files we tried to load but couldn't parse, OR additional files
   *  beyond the first (multiple alphas files = authoring mistake). */
  errors: Array<{ abs: string; relPath: string; message: string }>;
};

function relFromRoot(projectBase: string, abs: string): string {
  return (
    path.relative(projectBase, abs).split(path.sep).join("/") ||
    path.basename(abs)
  );
}

function isAlphaFile(name: string): boolean {
  return name.endsWith(".archik.alphas.yaml");
}

export async function discoverAlphaDoc(
  projectBase: string,
): Promise<AlphaDiscoveryResult> {
  const errors: AlphaDiscoveryResult["errors"] = [];
  const found: LoadedAlphaDoc[] = [];

  const tryLoad = async (abs: string): Promise<void> => {
    const relPath = relFromRoot(projectBase, abs);
    let text: string;
    try {
      text = await readFile(abs, "utf-8");
    } catch (err) {
      errors.push({
        abs,
        relPath,
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    let raw: unknown;
    try {
      raw = YAML.parse(text);
    } catch (err) {
      errors.push({
        abs,
        relPath,
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    const result = AlphaDocumentSchema.safeParse(raw);
    if (!result.success) {
      errors.push({
        abs,
        relPath,
        message: result.error.issues.map((i) => i.message).join("; "),
      });
      return;
    }
    found.push({ abs, relPath, doc: result.data });
  };

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
      if (e.isFile() && isAlphaFile(e.name)) {
        await tryLoad(full);
      }
    }
  };
  await walk(path.join(projectBase, ".archik"), 0);

  if (found.length === 0) return { doc: null, errors };
  // First file wins; surface the rest as errors so the user picks one.
  for (let i = 1; i < found.length; i++) {
    errors.push({
      abs: found[i]!.abs,
      relPath: found[i]!.relPath,
      message:
        `multiple alphas files detected — pick one canonical path ` +
        `(first one found: ${found[0]!.relPath})`,
    });
  }
  return { doc: found[0]!, errors };
}
