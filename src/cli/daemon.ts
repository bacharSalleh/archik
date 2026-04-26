import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
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

function key(docPath: string): string {
  return createHash("sha256").update(docPath).digest("hex").slice(0, 12);
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

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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
      if (existing && isAlive(existing.pid)) {
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
