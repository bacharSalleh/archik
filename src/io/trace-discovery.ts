import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { TraceDocumentSchema } from "../domain/trace-schema.ts";
import type { TraceDocument } from "../domain/trace-schema.ts";

const MAX_DEPTH = 6;

export type LoadedTraceDoc = {
  abs: string;
  relPath: string;
  doc: TraceDocument;
};

export type TraceDiscoveryResult = {
  docs: LoadedTraceDoc[];
  errors: Array<{ abs: string; relPath: string; message: string }>;
};

function relFromRoot(projectBase: string, abs: string): string {
  return (
    path.relative(projectBase, abs).split(path.sep).join("/") ||
    path.basename(abs)
  );
}

/** Recursive walk over `.archik/` for `*.archik.trace.json`, mirroring
 *  the other discovery walkers. Parse errors are collected, not thrown. */
export async function discoverTraceDocs(
  projectBase: string,
): Promise<TraceDiscoveryResult> {
  const docs: LoadedTraceDoc[] = [];
  const errors: TraceDiscoveryResult["errors"] = [];

  const tryLoad = async (abs: string): Promise<void> => {
    const relPath = relFromRoot(projectBase, abs);
    let text: string;
    try {
      text = await readFile(abs, "utf-8");
    } catch (err) {
      errors.push({ abs, relPath, message: err instanceof Error ? err.message : String(err) });
      return;
    }
    try {
      const raw = JSON.parse(text);
      const result = TraceDocumentSchema.safeParse(raw);
      if (!result.success) {
        errors.push({ abs, relPath, message: result.error.issues.map((i) => i.message).join("; ") });
        return;
      }
      docs.push({ abs, relPath, doc: result.data });
    } catch (err) {
      errors.push({ abs, relPath, message: err instanceof Error ? err.message : String(err) });
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
      if (e.isFile() && e.name.endsWith(".archik.trace.json")) {
        await tryLoad(full);
      }
    }
  };
  await walk(path.join(projectBase, ".archik"), 0);

  return { docs, errors };
}
