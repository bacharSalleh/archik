/**
 * Walk a project for every use case file (`*.archik.uc.yaml`).
 * Convention: one file per use case, under `.archik/usecases/`.
 * Recursive so projects with sub-grouping (`.archik/usecases/billing/...`)
 * still work; depth-bounded to mirror discoverDocs.
 *
 * Pure I/O — schema validation is the caller's job (mirrors how
 * discoverDocs separates parse from validate). Returns LoadedUseCaseDoc[]
 * with raw parsed YAML; the validator runs SafeParse against
 * UseCaseDocumentSchema.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { UseCaseDocumentSchema } from "../domain/usecase-schema.ts";
import type { UseCaseDocument } from "../domain/usecase-schema.ts";

const MAX_DEPTH = 6;

export type LoadedUseCaseDoc = {
  abs: string;
  relPath: string;
  doc: UseCaseDocument;
};

export type UseCaseDiscoveryResult = {
  docs: LoadedUseCaseDoc[];
  errors: Array<{ abs: string; relPath: string; message: string }>;
};

function relFromRoot(projectBase: string, abs: string): string {
  return (
    path.relative(projectBase, abs).split(path.sep).join("/") ||
    path.basename(abs)
  );
}

function isUseCaseFile(name: string): boolean {
  return name.endsWith(".archik.uc.yaml");
}

export async function discoverUseCaseDocs(
  projectBase: string,
): Promise<UseCaseDiscoveryResult> {
  const docs: LoadedUseCaseDoc[] = [];
  const errors: UseCaseDiscoveryResult["errors"] = [];

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
    const result = UseCaseDocumentSchema.safeParse(raw);
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
      if (e.isFile() && isUseCaseFile(e.name)) {
        await tryLoad(full);
      }
    }
  };
  await walk(path.join(projectBase, ".archik", "usecases"), 0);

  return { docs, errors };
}
