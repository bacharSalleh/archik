/**
 * Project-local runtime state — a `.archik/runtime.json` file that
 * lives next to the project's archik documents and records the
 * currently-running dev server's PID, port, host, and URL.
 *
 * Distinct from the tmpdir-based daemon state in `daemon.ts`, which
 * is keyed by hash of the doc path and lives under
 * `$TMPDIR/archik-cli/`. The tmpdir registry powers the
 * "across-all-projects" view of `archik status`; this project-local
 * file makes "is archik running for THIS project?" answerable from
 * within the project itself, without scanning a global directory or
 * matching by hash.
 *
 * Lifecycle:
 *   - `archik dev` / `archik start` write it once the server is up.
 *   - `archik stop` and `dev`'s shutdown handler remove it.
 *   - `archik status` reads it (when invoked inside a project) as
 *     the primary signal, with PID + URL probe ground-truthing.
 *
 * Convention: file lives at `<project-root>/.archik/runtime.json`,
 * regardless of whether the project uses the new `.archik/main.…`
 * layout or the legacy root-level `architecture.archik.yaml`. The
 * `.archik/` directory is created on demand if missing — the
 * runtime file is always per-machine ephemeral state, never
 * committed (see `.gitignore` handling in `init.ts`).
 */
import { existsSync, mkdirSync } from "node:fs";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DaemonState } from "./daemon.ts";
import { projectRoot } from "./resolveDocPath.ts";

export type ProjectRuntimeState = {
  pid: number;
  port: number;
  host: string;
  url: string;
  startedAt: string;
};

/** Filename within the project's `.archik/` directory. */
export const RUNTIME_FILENAME = "runtime.json";

/**
 * Absolute path to `.archik/runtime.json` for a given archik doc.
 * Always under `<project-root>/.archik/`; the directory is created
 * on demand by `writeProjectState`.
 */
export function projectStatePath(docPath: string): string {
  return path.join(projectRoot(docPath), ".archik", RUNTIME_FILENAME);
}

/**
 * Atomically write the runtime state. Creates `<root>/.archik/` if
 * it doesn't exist (legacy layouts don't have one).
 */
export async function writeProjectState(
  docPath: string,
  state: ProjectRuntimeState,
): Promise<void> {
  const target = projectStatePath(docPath);
  const dir = path.dirname(target);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${target}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2) + "\n", "utf-8");
  await rename(tmp, target);
}

/** Returns null if the file is missing or unparseable. */
export async function readProjectState(
  docPath: string,
): Promise<ProjectRuntimeState | null> {
  const target = projectStatePath(docPath);
  try {
    const text = await readFile(target, "utf-8");
    const parsed = JSON.parse(text) as Partial<ProjectRuntimeState>;
    if (
      typeof parsed.pid !== "number" ||
      typeof parsed.port !== "number" ||
      typeof parsed.host !== "string" ||
      typeof parsed.url !== "string" ||
      typeof parsed.startedAt !== "string"
    ) {
      return null;
    }
    return parsed as ProjectRuntimeState;
  } catch {
    return null;
  }
}

/**
 * Reconstruct a `ProjectRuntimeState` from a tmpdir `DaemonState`.
 * Pure transform — the caller owns alive-checks and write-back.
 *
 * Used by `archik status` to heal the case where `runtime.json` was
 * deleted while the daemon kept running (typically by a `git clean
 * -fdX` matching the gitignore line `init` adds, or by an editor's
 * "clean untracked" action). The tmpdir state file under
 * `$TMPDIR/archik-cli/<hash>.json` remains canonical, so we can
 * always rebuild the project-local file from it.
 *
 * Returns null when the daemon state lacks a parseable loopback URL
 * — in that case there's nothing to reconstruct port/host from.
 */
export function runtimeStateFromDaemonState(
  state: Pick<DaemonState, "pid" | "startedAt" | "urls">,
): ProjectRuntimeState | null {
  const url = state.urls?.local?.[0];
  if (url === undefined) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.port === "") return null;
  const port = Number.parseInt(parsed.port, 10);
  if (!Number.isFinite(port)) return null;
  return {
    pid: state.pid,
    port,
    host: parsed.hostname,
    url,
    startedAt: state.startedAt,
  };
}

/** Removes the runtime file. Silently no-ops if it's already gone. */
export async function removeProjectState(docPath: string): Promise<void> {
  const target = projectStatePath(docPath);
  try {
    await unlink(target);
  } catch {
    // already gone — fine
  }
}
