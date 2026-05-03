import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { SeqDocumentSchema } from "../domain/seq-schema.ts";
import type { SeqDocument } from "../domain/seq-schema.ts";

export type LoadedSeqDoc = {
  abs: string;
  relPath: string;
  doc: SeqDocument;
};

export type SeqDiscoveryResult = {
  docs: LoadedSeqDoc[];
  errors: Array<{ abs: string; relPath: string; message: string }>;
};

export async function discoverSeqDocs(
  projectBase: string,
): Promise<SeqDiscoveryResult> {
  const docs: LoadedSeqDoc[] = [];
  const errors: SeqDiscoveryResult["errors"] = [];
  const archikDir = path.join(projectBase, ".archik");

  let entries: import("node:fs").Dirent<string>[];
  try {
    entries = await readdir(archikDir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return { docs, errors };
  }

  await Promise.all(
    entries
      .filter((e) => !e.isDirectory() && e.name.endsWith(".archik.seq.yaml"))
      .map(async (entry) => {
        const abs = path.join(archikDir, entry.name);
        const relPath = `.archik/${entry.name}`;
        let text: string;
        try {
          text = await readFile(abs, "utf-8");
        } catch (err) {
          errors.push({ abs, relPath, message: err instanceof Error ? err.message : String(err) });
          return;
        }
        try {
          const raw = YAML.parse(text);
          const result = SeqDocumentSchema.safeParse(raw);
          if (!result.success) {
            errors.push({ abs, relPath, message: result.error.issues.map((i) => i.message).join("; ") });
            return;
          }
          docs.push({ abs, relPath, doc: result.data });
        } catch (err) {
          errors.push({ abs, relPath, message: err instanceof Error ? err.message : String(err) });
        }
      }),
  );

  return { docs, errors };
}
