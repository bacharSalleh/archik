import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

/** Copy the project's archik state to a fresh sibling
 *  `.archik.archive/<timestamp>/` and return its absolute path. The
 *  archive lives OUTSIDE `.archik/` so discovery never descends into it.
 *  Originals are left untouched — this is the pristine restore copy. */
export function archiveProject(root: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archiveDir = path.join(root, ".archik.archive", stamp);
  mkdirSync(archiveDir, { recursive: true });

  const archikDir = path.join(root, ".archik");
  if (existsSync(archikDir)) {
    cpSync(archikDir, path.join(archiveDir, ".archik"), {
      recursive: true,
      // never copy a previous archive into the new one
      filter: (src) => !src.includes(`${path.sep}.archik.archive${path.sep}`),
    });
  }
  const legacy = path.join(root, "architecture.archik.yaml");
  if (existsSync(legacy)) {
    cpSync(legacy, path.join(archiveDir, "architecture.archik.yaml"));
  }
  return archiveDir;
}
