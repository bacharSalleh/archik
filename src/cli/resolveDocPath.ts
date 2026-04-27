import { access } from "node:fs/promises";
import path from "node:path";

/** New convention: archik files live under `.archik/`. */
export const NEW_DEFAULT_REL = ".archik/main.archik.yaml";
/** Legacy default — still supported when no explicit path is given. */
export const LEGACY_DEFAULT_REL = "architecture.archik.yaml";

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the archik doc path for a *read* command (validate, render,
 * dev, etc.). Returns an absolute path.
 *
 * Resolution order:
 *   1. If `explicit` is provided, use it as-is.
 *   2. If `<cwd>/architecture.archik.yaml` exists (legacy), use it.
 *   3. Otherwise return `<cwd>/.archik/main.archik.yaml` (new
 *      convention) — the caller will fail with a normal "file not
 *      found" if it doesn't exist either, just as before.
 *
 * Throws if both the legacy and new files exist — that's an
 * ambiguous setup the user has to resolve manually.
 */
export async function resolveDocPath(
  explicit: string | undefined,
  cwd: string = process.cwd(),
): Promise<string> {
  if (explicit !== undefined && explicit !== "") {
    return path.resolve(cwd, explicit);
  }
  const legacy = path.resolve(cwd, LEGACY_DEFAULT_REL);
  const next = path.resolve(cwd, NEW_DEFAULT_REL);
  const [hasLegacy, hasNext] = await Promise.all([
    exists(legacy),
    exists(next),
  ]);
  if (hasLegacy && hasNext) {
    throw new Error(
      `Found both ${LEGACY_DEFAULT_REL} and ${NEW_DEFAULT_REL}. ` +
        `Pick one — keep the file under .archik/ (preferred) and ` +
        `delete the root copy, or vice versa.`,
    );
  }
  if (hasLegacy) return legacy;
  return next;
}

/**
 * Resolve the archik doc path for `archik init`. Init wants the
 * *target to write to*, not an existing file.
 *
 * - If `explicit` is provided, use it.
 * - If the legacy root file already exists, target it (we'll refuse
 *   to overwrite it later with a clear error). This lets users see
 *   the conflict early.
 * - Otherwise default to the new `.archik/main.archik.yaml`.
 */
export async function resolveInitTarget(
  explicit: string | undefined,
  cwd: string = process.cwd(),
): Promise<string> {
  if (explicit !== undefined && explicit !== "") {
    return path.resolve(cwd, explicit);
  }
  const legacy = path.resolve(cwd, LEGACY_DEFAULT_REL);
  if (await exists(legacy)) return legacy;
  return path.resolve(cwd, NEW_DEFAULT_REL);
}

/**
 * Project root for a given doc path. With the legacy root layout the
 * project root is the doc's own directory; with the `.archik/` layout
 * it's one level above. Used by commands that look for sibling
 * source folders (src/, services/, packages/, apps/).
 */
export function projectRoot(docPath: string): string {
  const dir = path.dirname(docPath);
  if (path.basename(dir) === ".archik") return path.dirname(dir);
  return dir;
}
