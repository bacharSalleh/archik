import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Locate the archik package root. Three resolution strategies, in order:
 *
 * 1. `ARCHIK_PKG_ROOT` env var — set by `bin/archik.js` so the CLI never
 *    has to guess where the install lives. Works for both the published
 *    bundled entry (`dist/cli/archik.mjs`) and the in-repo `tsx` entry
 *    (`src/cli/index.ts`).
 * 2. Walk up from this module looking for `package.json`. Used when the
 *    CLI is invoked directly (e.g. `npm run archik`) without going
 *    through bin.
 * 3. Throw — caller is invoking us in some way we don't recognise.
 */
export function pkgRoot(): string {
  const env = process.env["ARCHIK_PKG_ROOT"];
  if (env) return path.resolve(env);

  const here = path.dirname(realpathSync(fileURLToPath(import.meta.url)));
  let dir = here;
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `archik: could not locate package root (start: ${here})`,
  );
}
