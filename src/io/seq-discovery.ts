import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { SeqDocumentSchema } from "../domain/seq-schema.ts";
import type { SeqDocument } from "../domain/seq-schema.ts";

const MAX_DEPTH = 6;

export type LoadedSeqDoc = {
  abs: string;
  relPath: string;
  doc: SeqDocument;
};

export type SeqDiscoveryResult = {
  docs: LoadedSeqDoc[];
  errors: Array<{ abs: string; relPath: string; message: string }>;
};

function relFromRoot(projectBase: string, abs: string): string {
  return (
    path.relative(projectBase, abs).split(path.sep).join("/") ||
    path.basename(abs)
  );
}

/**
 * Recursive walk over `.archik/` for `*.archik.seq.yaml`. Mirrors
 * `discoverDocs` / `discoverUseCaseDocs` so a project organising
 * seq files under e.g. `.archik/seqs/billing-checkout.archik.seq.yaml`
 * still has them picked up by the validator + the canvas. Bounded by
 * MAX_DEPTH the same way as the other walkers so a pathological
 * symlink tree can't trap us.
 */
export async function discoverSeqDocs(
  projectBase: string,
): Promise<SeqDiscoveryResult> {
  const docs: LoadedSeqDoc[] = [];
  const errors: SeqDiscoveryResult["errors"] = [];

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
    try {
      const raw = YAML.parse(text);
      const result = SeqDocumentSchema.safeParse(raw);
      if (!result.success) {
        errors.push({
          abs,
          relPath,
          message: result.error.issues.map((i) => i.message).join("; "),
        });
        return;
      }
      docs.push({ abs, relPath, doc: result.data });
    } catch (err) {
      errors.push({
        abs,
        relPath,
        message: err instanceof Error ? err.message : String(err),
      });
    }
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
      if (e.isFile() && e.name.endsWith(".archik.seq.yaml")) {
        await tryLoad(full);
      }
    }
  };
  await walk(path.join(projectBase, ".archik"), 0);

  return { docs, errors };
}
