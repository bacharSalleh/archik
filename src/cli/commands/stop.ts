import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { daemonPaths, isAlive, readState, removeState } from "../daemon.ts";
import type { ParsedOptions } from "../options.ts";

const SIGTERM_GRACE_MS = 5_000;

/**
 * Send `signal` to `pid`, swallowing ESRCH (process already dead).
 *
 * We do NOT use process.kill(-pid, …) here. The state file stores the
 * dev process's own PID, which is not a process group leader (the
 * group leader is the outer `bin/archik.js` that start() spawned with
 * detached:true). Targeting -pid would silently fail with ESRCH and
 * leave the dev orphaned. Killing the dev PID directly is enough:
 * dev's SIGTERM handler shuts the server down cleanly, and the outer
 * bin's blocking spawnSync returns + exits as soon as its child does.
 */
function killProcess(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
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

  killProcess(state.pid, "SIGTERM");

  const deadline = Date.now() + SIGTERM_GRACE_MS;
  while (Date.now() < deadline) {
    if (!isAlive(state.pid)) break;
    await sleep(100);
  }

  if (isAlive(state.pid)) {
    killProcess(state.pid, "SIGKILL");
    await sleep(200);
  }

  removeState(paths.stateFile);
  console.log(`✓ archik stopped (PID ${state.pid})`);
  return 0;
}
