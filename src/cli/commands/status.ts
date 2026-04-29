import { readdirSync } from "node:fs";
import path from "node:path";
import { bold, cyan, dim, gray, yellow } from "../colors.ts";
import {
  daemonDir,
  isAlive,
  isResponsive,
  readState,
  removeState,
  type DaemonState,
} from "../daemon.ts";
import type { ParsedOptions } from "../options.ts";
import {
  projectStatePath,
  readProjectState,
  removeProjectState,
} from "../projectState.ts";
import { resolveDocPath } from "../resolveDocPath.ts";

export async function statusCommand(_opts: ParsedOptions): Promise<number> {
  // Project-local view first: if cwd resolves to an archik doc and
  // there's a `.archik/runtime.json`, that's the canonical answer
  // for "is archik running here?". The cross-project listing below
  // remains useful for running instances in OTHER projects.
  const thisProjectDocPath = await reportThisProject();

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

  // Filter out the current project from the cross-project list — it's
  // already shown above by reportThisProject().
  const others = running.filter(
    (r) => thisProjectDocPath === null || r.docPath !== thisProjectDocPath,
  );

  if (others.length === 0) {
    if (thisProjectDocPath === null && running.length === 0) {
      console.log(`${gray("•")} No archik instances running.`);
    }
    return 0;
  }

  console.log("");
  console.log(
    `${bold(thisProjectDocPath !== null ? "Other projects" : "Running")}`,
  );
  for (const r of others) {
    console.log("");
    console.log(`  ${bold(cyan(r.url))}`);
    console.log(`    ${dim("PID")}      ${r.pid}`);
    console.log(`    ${dim("editing")}  ${bold(r.docPath)}`);
    console.log(`    ${dim("started")}  ${dim(r.startedAt)}`);
    console.log(`    ${dim("logs")}     ${dim(r.logFile)}`);
  }
  console.log("");
  return 0;
}

/**
 * Report on the project rooted at cwd, if any. Reads the
 * project-local `.archik/runtime.json`, verifies the recorded PID
 * is alive, and prints a small per-project header. Returns the
 * resolved docPath when a running entry was reported (so the caller
 * can de-dupe the cross-project list); null otherwise.
 *
 * Silent when:
 *   - cwd doesn't resolve to an archik doc (no project here);
 *   - a doc exists but no runtime.json (archik isn't running here).
 *
 * On a stale runtime.json (PID dead), removes it silently — the
 * file is meant to be ground truth, so dead-PID entries are cleaned
 * up the same way `archik status` cleans up tmpdir state.
 */
async function reportThisProject(): Promise<string | null> {
  let docPath: string;
  try {
    docPath = await resolveDocPath(undefined);
  } catch {
    return null; // not in a project, or ambiguous setup
  }
  const state = await readProjectState(docPath);
  if (state === null) return null;

  const alive = isAlive({ pid: state.pid, startedAt: state.startedAt });
  if (!alive) {
    await removeProjectState(docPath).catch(() => undefined);
    console.log("");
    console.log(
      `${yellow("!")} Stale ${bold(".archik/runtime.json")} cleaned up — recorded PID ${state.pid} is no longer running.`,
    );
    return null;
  }

  const rel =
    path.relative(process.cwd(), projectStatePath(docPath)) ||
    projectStatePath(docPath);
  console.log("");
  console.log(`${bold("This project")} ${dim(`(${rel})`)}`);
  console.log(`  ${bold(cyan(state.url))}`);
  console.log(`  ${dim("PID")}      ${state.pid}`);
  console.log(`  ${dim("port")}     ${state.port}`);
  console.log(`  ${dim("editing")}  ${bold(docPath)}`);
  console.log(`  ${dim("started")}  ${dim(state.startedAt)}`);
  return docPath;
}
