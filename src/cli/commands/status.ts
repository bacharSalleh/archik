import { readdirSync } from "node:fs";
import path from "node:path";
import { bold, cyan, dim, gray } from "../colors.ts";
import {
  daemonDir,
  isResponsive,
  readState,
  removeState,
  type DaemonState,
} from "../daemon.ts";
import type { ParsedOptions } from "../options.ts";

export async function statusCommand(_opts: ParsedOptions): Promise<number> {
  const dir = daemonDir();
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    // no daemon dir yet — nothing running
  }

  // Probe every state file in parallel. PID-only liveness can be a
  // false positive (PID reuse, dead dev server but lingering parent),
  // so we ground-truth with an HTTP HEAD on the recorded URL — if it
  // doesn't answer, the entry is stale and we drop it from disk.
  const candidates: Array<{ stateFile: string; state: DaemonState }> = [];
  for (const f of files) {
    const stateFile = path.join(dir, f);
    const state = readState(stateFile);
    if (state) candidates.push({ stateFile, state });
  }
  const probes = await Promise.all(
    candidates.map(async ({ stateFile, state }) => ({
      stateFile,
      state,
      alive: await isResponsive(state),
    })),
  );

  const running: Array<{
    pid: number;
    url: string;
    docPath: string;
    startedAt: string;
    logFile: string;
  }> = [];

  for (const { stateFile, state, alive } of probes) {
    if (!alive) {
      removeState(stateFile);
      continue;
    }
    running.push({
      pid: state.pid,
      url: state.urls.local[0] ?? "(unknown)",
      docPath: state.docPath,
      startedAt: state.startedAt,
      logFile: state.logFile,
    });
  }

  if (running.length === 0) {
    console.log(`${gray("•")} No archik instances running.`);
    return 0;
  }

  for (const r of running) {
    console.log("");
    console.log(`${bold(cyan(r.url))}`);
    console.log(`  ${dim("PID")}      ${r.pid}`);
    console.log(`  ${dim("editing")}  ${bold(r.docPath)}`);
    console.log(`  ${dim("started")}  ${dim(r.startedAt)}`);
    console.log(`  ${dim("logs")}     ${dim(r.logFile)}`);
  }
  console.log("");
  return 0;
}
