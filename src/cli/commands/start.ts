import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { access, open } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  daemonPaths,
  ensureDaemonDir,
  isAlive,
  readState,
  removeState,
} from "../daemon.ts";
import { getString, type ParsedOptions } from "../options.ts";

const READY_TIMEOUT_MS = 10_000;

function pkgRoot(): string {
  // Resolve through symlinks so this works under `npm link`.
  // src/cli/commands/start.ts → src/cli/commands → src/cli → src → root
  const here = path.dirname(realpathSync(fileURLToPath(import.meta.url)));
  return path.resolve(here, "..", "..", "..");
}

export async function startCommand(opts: ParsedOptions): Promise<number> {
  const file = opts._[0] ?? "architecture.archik.yaml";
  const docPath = path.resolve(file);

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
  if (existing && isAlive(existing.pid)) {
    const url = existing.urls.local[0] ?? "(unknown)";
    console.error(`✗ archik is already running for ${docPath}`);
    console.error(`  PID ${existing.pid} on ${url}`);
    console.error(`  Run \`archik stop\` first.`);
    return 1;
  }
  if (existing) removeState(paths.stateFile);

  ensureDaemonDir();

  const root = pkgRoot();
  const tsxBin = path.resolve(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx",
  );
  const cliEntry = path.resolve(root, "src", "cli", "index.ts");
  const tsconfig = path.resolve(root, "tsconfig.app.json");

  const childArgs = [
    "--tsconfig",
    tsconfig,
    cliEntry,
    "dev",
    docPath,
    "--no-open",
  ];
  const port = getString(opts, "port");
  if (port !== undefined) childArgs.push("--port", port);
  const host = getString(opts, "host");
  if (host !== undefined) childArgs.push("--host", host);

  const log = await open(paths.logFile, "a");
  const child = spawn(tsxBin, childArgs, {
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
    if (!isAlive(groupPid)) break;
    await sleep(100);
  }

  if (!ready) {
    if (isAlive(groupPid)) {
      try {
        process.kill(-groupPid, "SIGTERM");
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
