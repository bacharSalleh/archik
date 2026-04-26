import { readdirSync } from "node:fs";
import path from "node:path";
import { daemonDir, isAlive, readState, removeState } from "../daemon.ts";
import type { ParsedOptions } from "../options.ts";

export async function statusCommand(_opts: ParsedOptions): Promise<number> {
  const dir = daemonDir();
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    // no daemon dir yet — nothing running
  }

  const running: Array<{
    pid: number;
    url: string;
    docPath: string;
    startedAt: string;
    logFile: string;
  }> = [];

  for (const f of files) {
    const stateFile = path.join(dir, f);
    const state = readState(stateFile);
    if (!state) continue;
    if (!isAlive(state)) {
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
    console.log("No archik instances running.");
    return 0;
  }

  for (const r of running) {
    console.log(`${r.url}`);
    console.log(`  PID      ${r.pid}`);
    console.log(`  editing  ${r.docPath}`);
    console.log(`  started  ${r.startedAt}`);
    console.log(`  logs     ${r.logFile}`);
  }
  return 0;
}
