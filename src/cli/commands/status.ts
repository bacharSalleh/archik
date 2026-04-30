import { readdirSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { bold, cyan, dim, gray, yellow } from "../colors.ts";
import {
  daemonDir,
  daemonPaths,
  isAlive,
  isResponsive,
  readState,
  removeState,
  type DaemonState,
} from "../daemon.ts";
import type { ParsedOptions } from "../options.ts";
import {
  type ProjectRuntimeState,
  projectStatePath,
  readProjectState,
  removeProjectState,
  runtimeStateFromDaemonState,
  writeProjectState,
} from "../projectState.ts";
import { resolveDocPath } from "../resolveDocPath.ts";

/**
 * Three-way result so the caller can distinguish "no archik project
 * here" from "this project has no server running" — the second case
 * needs an explicit message so cross-project daemons listed below
 * aren't mistaken for this one.
 */
type ThisProjectReport =
  | { kind: "not-in-project" }
  | { kind: "not-running"; docPath: string }
  | { kind: "running"; docPath: string };

export async function statusCommand(_opts: ParsedOptions): Promise<number> {
  // Project-local view first: if cwd resolves to an archik doc and
  // there's a `.archik/runtime.json`, that's the canonical answer
  // for "is archik running here?". The cross-project listing below
  // remains useful for running instances in OTHER projects.
  const thisProject = await reportThisProject();

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
  const thisProjectDocPath =
    thisProject.kind === "not-in-project" ? null : thisProject.docPath;
  const others = running.filter(
    (r) => thisProjectDocPath === null || r.docPath !== thisProjectDocPath,
  );

  // Explicit "not running for this project" line. Without it, the
  // cross-project block below is the only thing on screen and reads
  // as if it belonged to the current project — which is the exact
  // confusion this command exists to prevent.
  if (thisProject.kind === "not-running") {
    console.log("");
    console.log(
      `${gray("•")} No archik server running for this project.`,
    );
    if (others.length > 0) {
      console.log(
        `  ${dim(`(${others.length} daemon${others.length === 1 ? "" : "s"} running in other projects — see below)`)}`,
      );
    }
  }

  if (others.length === 0) {
    if (thisProject.kind === "not-in-project" && running.length === 0) {
      console.log(`${gray("•")} No archik instances running.`);
    }
    return 0;
  }

  console.log("");
  // Header: when we're inside an archik project (running or not), the
  // cross-project list is "Other projects" so it can't be confused
  // with this one. Outside any archik project, plain "Running".
  console.log(
    `${bold(thisProject.kind === "not-in-project" ? "Running" : "Other projects")}`,
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
 * is alive, and prints a small per-project header when running.
 *
 * Returns:
 *   - { kind: "not-in-project" }   — cwd doesn't resolve to a doc
 *   - { kind: "not-running", … }   — doc resolves but no live daemon
 *   - { kind: "running", … }       — printed the per-project header
 *
 * On a stale runtime.json (PID dead), removes it and prints a
 * cleanup notice — the file is meant to be ground truth, so dead-PID
 * entries are cleaned up the same way `archik status` cleans up
 * tmpdir state. The result in that case is "not-running" so the
 * caller still emits the explicit not-running line.
 */
async function reportThisProject(): Promise<ThisProjectReport> {
  let docPath: string;
  try {
    docPath = await resolveDocPath(undefined);
  } catch {
    // Ambiguous setup (both legacy + new files present). Caller
    // treats this as "not in a project" — same as cwd having no
    // archik file at all.
    return { kind: "not-in-project" };
  }
  // resolveDocPath returns the default path even when the file is
  // missing, so we have to verify on disk. Without this check every
  // cwd looks like an archik project.
  try {
    await access(docPath);
  } catch {
    return { kind: "not-in-project" };
  }
  let state = await readProjectState(docPath);
  if (state === null) {
    // runtime.json missing — heal from the canonical tmpdir state if
    // the daemon is still alive. Covers the case where something
    // (typically `git clean -fdX` matching the gitignore line, or an
    // editor's "clean untracked") removed the file out from under a
    // running daemon. Returns not-running when the daemon is gone.
    state = await rebuildProjectState(docPath);
    if (state === null) return { kind: "not-running", docPath };
  }

  const alive = isAlive({ pid: state.pid, startedAt: state.startedAt });
  if (!alive) {
    await removeProjectState(docPath).catch(() => undefined);
    console.log("");
    console.log(
      `${yellow("!")} Stale ${bold(".archik/runtime.json")} cleaned up — recorded PID ${state.pid} is no longer running.`,
    );
    return { kind: "not-running", docPath };
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
  return { kind: "running", docPath };
}

/**
 * Try to reconstruct `.archik/runtime.json` from the canonical tmpdir
 * daemon state. Returns the rebuilt entry on success (and persists it
 * to disk best-effort), or null when there's nothing to rebuild from.
 *
 * Persistence is fire-and-forget — `archik status` should still print
 * the right thing even if the filesystem rejects the write (read-only
 * mount, permission change, race with `archik stop`). The in-memory
 * state is what the caller renders.
 */
async function rebuildProjectState(
  docPath: string,
): Promise<ProjectRuntimeState | null> {
  const { stateFile } = daemonPaths(docPath);
  const dState = readState(stateFile);
  if (dState === null) return null;
  if (!isAlive({ pid: dState.pid, startedAt: dState.startedAt })) return null;
  const rebuilt = runtimeStateFromDaemonState(dState);
  if (rebuilt === null) return null;
  await writeProjectState(docPath, rebuilt).catch(() => undefined);
  return rebuilt;
}
