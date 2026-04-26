import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

export type DaemonState = {
  pid: number;
  docPath: string;
  logFile: string;
  startedAt: string;
  urls: { local: string[]; network: string[] };
};

export type AcquireResult =
  | { ok: true }
  | { ok: false; existing: DaemonState };

export type DaemonPaths = {
  stateFile: string;
  logFile: string;
  readyFile: string;
};

export function daemonDir(): string {
  return path.join(os.tmpdir(), "archik-cli");
}

export function ensureDaemonDir(): string {
  const dir = daemonDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Canonicalise the doc path so two callers that name the same file
 * via different paths (e.g. /tmp/x and /private/tmp/x on macOS, or
 * a relative vs absolute form, or via a symlinked dir) end up with
 * the same hash and therefore the same state file.
 *
 * realpathSync requires the file to exist; if it doesn't (e.g. stop
 * after the YAML was deleted), fall back to plain path.resolve so we
 * still produce a consistent string.
 */
function canonical(docPath: string): string {
  try {
    return realpathSync(docPath);
  } catch {
    return path.resolve(docPath);
  }
}

function key(docPath: string): string {
  return createHash("sha256")
    .update(canonical(docPath))
    .digest("hex")
    .slice(0, 12);
}

export function daemonPaths(docPath: string): DaemonPaths {
  const dir = daemonDir();
  const k = key(docPath);
  return {
    stateFile: path.join(dir, `${k}.json`),
    logFile: path.join(dir, `${k}.log`),
    readyFile: path.join(dir, `${k}.ready`),
  };
}

export function readState(stateFile: string): DaemonState | null {
  if (!existsSync(stateFile)) return null;
  try {
    return JSON.parse(readFileSync(stateFile, "utf8")) as DaemonState;
  } catch {
    return null;
  }
}

export function writeState(stateFile: string, state: DaemonState): void {
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

export function removeState(stateFile: string): void {
  try {
    unlinkSync(stateFile);
  } catch {
    // already gone
  }
}

/** Raw "is some process with this PID currently scheduled". */
export function pidExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Best-effort process start time via `ps -o lstart=`. Returns null
 * on any platform where that fails (Windows, locked-down container,
 * malformed output) so the caller can fall back to "give it the
 * benefit of the doubt" rather than killing a real daemon.
 */
function processStartTime(pid: number): Date | null {
  const res = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8",
  });
  if (res.status !== 0) return null;
  const trimmed = res.stdout.trim();
  if (trimmed.length === 0) return null;
  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/**
 * "Is the process recorded in the state file *still our daemon*?"
 *
 * `process.kill(pid, 0)` only tells us whether *some* process owns
 * that PID right now — on Linux PIDs get recycled and an unrelated
 * process can occupy the slot, locking the user out of `archik
 * start`. We cross-check by asking the OS what time the PID was
 * launched and comparing to the timestamp we wrote at lock time. A
 * gap larger than the fork → state-write window means PID reuse.
 */
export function isAlive(state: Pick<DaemonState, "pid" | "startedAt">): boolean {
  if (!pidExists(state.pid)) return false;
  const actual = processStartTime(state.pid);
  if (actual === null) return true; // can't verify — assume alive.
  const recorded = new Date(state.startedAt);
  if (!Number.isFinite(recorded.getTime())) return true;
  // Allow a generous window: `ps -o lstart=` truncates to seconds,
  // and there's a small gap between fork() and writing startedAt.
  const STALE_WINDOW_MS = 30_000;
  return Math.abs(actual.getTime() - recorded.getTime()) <= STALE_WINDOW_MS;
}

/**
 * Atomically claim the state file. Uses O_EXCL so two processes
 * racing for the lock can't both succeed. If the file already
 * exists but its owner is dead, clears it and retries.
 */
export function acquireLock(
  stateFile: string,
  initial: DaemonState,
): AcquireResult {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = openSync(stateFile, "wx");
      try {
        writeSync(fd, JSON.stringify(initial, null, 2));
      } finally {
        closeSync(fd);
      }
      return { ok: true };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw err;
      const existing = readState(stateFile);
      if (existing && isAlive(existing)) {
        return { ok: false, existing };
      }
      removeState(stateFile);
    }
  }
  // Three EEXIST in a row with stale owners — surface whatever's there.
  const existing = readState(stateFile);
  return existing
    ? { ok: false, existing }
    : { ok: true /* empty after cleanup, treat as acquired */ };
}

export function updateState(
  stateFile: string,
  patch: Partial<DaemonState>,
): void {
  const current = readState(stateFile);
  if (!current) return;
  writeState(stateFile, { ...current, ...patch });
}
