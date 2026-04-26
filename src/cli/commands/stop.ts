import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { daemonPaths, isAlive, readState, removeState } from "../daemon.ts";
import type { ParsedOptions } from "../options.ts";

const SIGTERM_GRACE_MS = 5_000;

function killGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    if (process.platform === "win32") {
      process.kill(pid, signal);
    } else {
      process.kill(-pid, signal);
    }
  } catch {
    // already dead — fine
  }
}

export async function stopCommand(opts: ParsedOptions): Promise<number> {
  const file = opts._[0] ?? "architecture.archik.yaml";
  const docPath = path.resolve(file);
  const paths = daemonPaths(docPath);
  const state = readState(paths.stateFile);

  if (!state) {
    console.log(`archik is not running for ${docPath}`);
    return 0;
  }

  if (!isAlive(state.pid)) {
    removeState(paths.stateFile);
    console.log(`archik was not running (cleaned up stale state)`);
    return 0;
  }

  killGroup(state.pid, "SIGTERM");

  const deadline = Date.now() + SIGTERM_GRACE_MS;
  while (Date.now() < deadline) {
    if (!isAlive(state.pid)) break;
    await sleep(100);
  }

  if (isAlive(state.pid)) {
    killGroup(state.pid, "SIGKILL");
    await sleep(200);
  }

  removeState(paths.stateFile);
  console.log(`✓ archik stopped (PID ${state.pid})`);
  return 0;
}
