/**
 * Walk a project for actor files (`*.archik.actors.yaml`). Recursive
 * under `.archik/`; depth-bounded. Most projects will keep one file
 * (e.g. `.archik/actors.archik.actors.yaml`) but multiple are allowed
 * — the validator merges actor ids across files and rejects duplicates.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ActorDocumentSchema } from "../domain/actor-schema.ts";
import type { ActorDocument } from "../domain/actor-schema.ts";

const MAX_DEPTH = 6;

export type LoadedActorDoc = {
  abs: string;
  relPath: string;
  doc: ActorDocument;
};

export type ActorDiscoveryResult = {
  docs: LoadedActorDoc[];
  errors: Array<{ abs: string; relPath: string; message: string }>;
};

function relFromRoot(projectBase: string, abs: string): string {
  return (
    path.relative(projectBase, abs).split(path.sep).join("/") ||
    path.basename(abs)
  );
}

function isActorFile(name: string): boolean {
  return name.endsWith(".archik.actors.yaml");
}

export async function discoverActorDocs(
  projectBase: string,
): Promise<ActorDiscoveryResult> {
  const docs: LoadedActorDoc[] = [];
  const errors: ActorDiscoveryResult["errors"] = [];

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
    const result = ActorDocumentSchema.safeParse(raw);
    if (!result.success) {
      errors.push({
        abs,
        relPath,
        message: result.error.issues.map((i) => i.message).join("; "),
      });
      return;
    }
    docs.push({ abs, relPath, doc: result.data });
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
      if (e.isFile() && isActorFile(e.name)) {
        await tryLoad(full);
      }
    }
  };
  await walk(path.join(projectBase, ".archik"), 0);

  return { docs, errors };
}
