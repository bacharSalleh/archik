import { spawn } from "node:child_process";
import { access, open } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  daemonPaths,
  ensureDaemonDir,
  isAlive,
  pidExists,
  readState,
  removeState,
} from "../daemon.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { pkgRoot } from "../paths.ts";
import { resolveDocPath } from "../resolveDocPath.ts";

const READY_TIMEOUT_MS = 10_000;

export async function startCommand(opts: ParsedOptions): Promise<number> {
  let docPath: string;
  try {
    docPath = await resolveDocPath(opts._[0]);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const file = path.relative(process.cwd(), docPath) || docPath;

  try {
    await access(docPath);
  } catch {
    console.error(`✗ ${file} not found in ${process.cwd()}`);
    console.error(`  Run \`archik init\` to create one, then try again.`);
    return 1;
  }

  const paths = daemonPaths(docPath);

  // Friendly pre-flight: dev itself enforces the lock, but checking here
  // means we don't even spawn a child when something's already running.
  const existing = readState(paths.stateFile);
  if (existing && isAlive(existing)) {
    const url = existing.urls.local[0] ?? "(unknown)";
    console.error(`✗ archik is already running for ${docPath}`);
    console.error(`  PID ${existing.pid} on ${url}`);
    console.error(`  Run \`archik stop\` first.`);
    return 1;
  }
  if (existing) removeState(paths.stateFile);

  ensureDaemonDir();

  // Spawn through `bin/archik.js` so the dist/tsx switch lives in
  // exactly one place. The bin sets ARCHIK_PKG_ROOT for us; we just
  // pass ARCHIK_LOG_FILE so dev records its log path in the state file.
  const binEntry = path.resolve(pkgRoot(), "bin", "archik.js");
  const childArgs = [binEntry, "dev", docPath, "--no-open"];
  const port = getString(opts, "port");
  if (port !== undefined) childArgs.push("--port", port);
  const host = getString(opts, "host");
  if (host !== undefined) childArgs.push("--host", host);

  const log = await open(paths.logFile, "a");
  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: ["ignore", log.fd, log.fd],
    env: { ...process.env, ARCHIK_LOG_FILE: paths.logFile },
  });
  child.unref();
  await log.close();

  if (child.pid === undefined) {
    console.error(`✗ failed to spawn archik dev`);
    return 1;
  }

  const groupPid = child.pid;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let ready: ReturnType<typeof readState> = null;

  // Dev writes its own state on lock acquire (urls=[]), then updates it
  // with real URLs once Vite is listening. Poll until urls show up.
  while (Date.now() < deadline) {
    const state = readState(paths.stateFile);
    if (state && state.urls.local.length > 0) {
      ready = state;
      break;
    }
    if (!pidExists(groupPid)) break;
    await sleep(100);
  }

  if (!ready) {
    if (pidExists(groupPid)) {
      try {
        // Kill the spawned bin process — that's the group leader because
        // we created it with detached:true. Its blocking spawnSync of the
        // inner dev means killing bin (or its child) brings the whole
        // chain down.
        process.kill(groupPid, "SIGTERM");
      } catch {
        // best effort
      }
    }
    // Dev's exit handler clears state on its own, but if we killed it
    // mid-startup the file may still be there. Drop it.
    removeState(paths.stateFile);
    console.error(`✗ archik failed to start within ${READY_TIMEOUT_MS / 1000}s.`);
    console.error(`  See log: ${paths.logFile}`);
    return 1;
  }

  const url = ready.urls.local[0] ?? "(unknown)";
  console.log(`✓ archik started — ${url}`);
  console.log(`  editing  ${docPath}`);
  console.log(`  PID      ${ready.pid}`);
  console.log(`  logs     ${paths.logFile}`);
  console.log(`  stop     archik stop`);
  return 0;
}
