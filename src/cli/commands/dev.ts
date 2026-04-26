import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  acquireLock,
  daemonPaths,
  ensureDaemonDir,
  removeState,
  updateState,
} from "../daemon.ts";
import type { ParsedOptions } from "../options.ts";
import { getString } from "../options.ts";

/** Walk up from this file to the Archik package root. */
function archikRoot(): string {
  // src/cli/commands/dev.ts → src/cli/commands → src/cli → src → root
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..");
}

export async function devCommand(opts: ParsedOptions): Promise<number> {
  const file = opts._[0] ?? "architecture.archik.yaml";
  const docPath = path.resolve(file);

  try {
    await access(docPath);
  } catch {
    console.error(`✗ ${file} not found in ${process.cwd()}`);
    console.error(`  Run \`archik init\` to create one, then try again.`);
    return 1;
  }

  // Single-instance lock keyed by YAML path. Foreground `dev` and
  // backgrounded `start` share this lock, so two archik processes
  // can't serve the same project at once.
  ensureDaemonDir();
  const paths = daemonPaths(docPath);
  const lock = acquireLock(paths.stateFile, {
    pid: process.pid,
    docPath,
    logFile: process.env["ARCHIK_LOG_FILE"] ?? "",
    startedAt: new Date().toISOString(),
    urls: { local: [], network: [] },
  });
  if (!lock.ok) {
    const url = lock.existing.urls.local[0] ?? "(unknown)";
    console.error(`✗ archik is already running for ${docPath}`);
    console.error(`  PID ${lock.existing.pid} on ${url}`);
    console.error(`  Run \`archik stop\` first.`);
    return 1;
  }

  // Release the lock no matter how we exit.
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    removeState(paths.stateFile);
  };
  process.on("exit", release);

  // Tell the Vite plugin to serve / watch this YAML instead of the one
  // in Archik's own install directory.
  process.env["ARCHIK_DOC_PATH"] = docPath;

  const root = archikRoot();
  const portArg = getString(opts, "port");
  const port = portArg !== undefined ? Number.parseInt(portArg, 10) : undefined;
  const host = getString(opts, "host");

  let server;
  try {
    server = await createServer({
      root,
      configFile: path.join(root, "vite.config.ts"),
      server: {
        open: !opts["no-open"],
        ...(port !== undefined && Number.isFinite(port) ? { port } : {}),
        ...(host !== undefined ? { host } : {}),
      },
    });
    await server.listen();
  } catch (err) {
    release();
    throw err;
  }

  // Now that we have a real URL, publish it so `archik status` and
  // `archik start` (the parent process) can discover it.
  updateState(paths.stateFile, {
    urls: server.resolvedUrls ?? { local: [], network: [] },
  });

  console.log(`\narchik dev — editing ${docPath}`);
  server.printUrls();
  console.log("\nPress Ctrl+C to stop.\n");

  // Keep the process alive until interrupted.
  return new Promise<number>((resolve) => {
    const shutdown = async (): Promise<void> => {
      try {
        await server.close();
      } finally {
        release();
        resolve(0);
      }
    };
    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  });
}
