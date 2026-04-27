import { setTimeout as sleep } from "node:timers/promises";
import { bold, cross, dim, gray, tick } from "../colors.ts";
import { daemonPaths, isAlive, readState, removeState } from "../daemon.ts";
import type { ParsedOptions } from "../options.ts";
import { resolveDocPath } from "../resolveDocPath.ts";

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
  let docPath: string;
  try {
    docPath = await resolveDocPath(opts._[0]);
  } catch (err) {
    console.error(`${cross()} ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const paths = daemonPaths(docPath);
  const state = readState(paths.stateFile);

  if (!state) {
    console.log(`${gray("•")} archik is not running for ${dim(docPath)}`);
    return 0;
  }

  if (!isAlive(state)) {
    removeState(paths.stateFile);
    console.log(`${gray("•")} archik was not running ${dim("(cleaned up stale state)")}`);
    return 0;
  }

  killProcess(state.pid, "SIGTERM");

  const deadline = Date.now() + SIGTERM_GRACE_MS;
  while (Date.now() < deadline) {
    if (!isAlive(state)) break;
    await sleep(100);
  }

  if (isAlive(state)) {
    killProcess(state.pid, "SIGKILL");
    await sleep(200);
  }

  removeState(paths.stateFile);
  console.log(`${tick()} ${bold("archik stopped")} ${dim(`(PID ${state.pid})`)}`);
  return 0;
}
