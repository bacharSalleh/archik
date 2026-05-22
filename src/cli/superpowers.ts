import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const SUPERPOWERS_PLUGIN = "superpowers";
export const SUPERPOWERS_INSTALL_ID = "superpowers@claude-plugins-official";

/**
 * Report whether the Claude Code `superpowers` plugin is installed for the
 * given home directory (defaults to the real `~`). Two independent evidence
 * sources, checked in order — either one is sufficient:
 *
 *   1. `~/.claude/plugins/installed_plugins.json` — the authoritative
 *      manifest; we look for a `superpowers@<marketplace>` key.
 *   2. `~/.claude/plugins/cache/<marketplace>/superpowers/` — the cached
 *      install tree, used as a fallback when the manifest is missing or
 *      malformed.
 *
 * `home` is injectable so this is unit-testable against a fake tree.
 */
export async function detectSuperpowers(
  home: string = os.homedir(),
): Promise<boolean> {
  const pluginsDir = path.join(home, ".claude", "plugins");

  // 1. Authoritative manifest.
  try {
    const raw = await readFile(
      path.join(pluginsDir, "installed_plugins.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as { plugins?: Record<string, unknown> };
    const keys = Object.keys(parsed.plugins ?? {});
    if (keys.some((k) => k === SUPERPOWERS_PLUGIN || k.startsWith(`${SUPERPOWERS_PLUGIN}@`))) {
      return true;
    }
  } catch {
    // missing or malformed — fall through to the cache scan
  }

  // 2. Cache scan: plugins/cache/<marketplace>/superpowers
  const cacheDir = path.join(pluginsDir, "cache");
  let marketplaces: string[];
  try {
    marketplaces = await readdir(cacheDir);
  } catch {
    return false;
  }
  for (const marketplace of marketplaces) {
    try {
      const s = await stat(path.join(cacheDir, marketplace, SUPERPOWERS_PLUGIN));
      if (s.isDirectory()) return true;
    } catch {
      // not here — keep looking
    }
  }
  return false;
}
