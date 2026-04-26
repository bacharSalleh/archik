import { access } from "node:fs/promises";
import path from "node:path";
import { startDevServer } from "../../server/devServer.ts";
import {
  acquireLock,
  daemonPaths,
  ensureDaemonDir,
  removeState,
  updateState,
} from "../daemon.ts";
import type { ParsedOptions } from "../options.ts";
import { getString } from "../options.ts";
import { pkgRoot } from "../paths.ts";

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

  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    removeState(paths.stateFile);
  };
  process.on("exit", release);

  const portArg = getString(opts, "port");
  const port = portArg !== undefined ? Number.parseInt(portArg, 10) : undefined;
  const host = getString(opts, "host");
  const uiDir = path.join(pkgRoot(), "dist", "ui");

  let handle;
  try {
    handle = await startDevServer({
      docPath,
      uiDir,
      ...(host !== undefined ? { host } : {}),
      ...(port !== undefined && Number.isFinite(port) ? { port } : {}),
    });
  } catch (err) {
    release();
    throw err;
  }

  updateState(paths.stateFile, {
    urls: { local: [handle.url], network: [] },
  });

  const shouldOpen = !opts["no-open"];
  if (shouldOpen) {
    void openInBrowser(handle.url);
  }

  console.log(`\narchik dev — editing ${docPath}`);
  console.log(`  Local:  ${handle.url}`);
  console.log("\nPress Ctrl+C to stop.\n");

  return new Promise<number>((resolve) => {
    const shutdown = async (): Promise<void> => {
      try {
        await handle.close();
      } finally {
        release();
        resolve(0);
      }
    };
    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  });
}

/**
 * Best-effort browser launcher. Falls back silently — the URL is
 * always printed so the user can copy it manually.
 */
function openInBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    // Lazy import keeps the open path off the hot path of CLI startup.
    void import("node:child_process").then(({ spawn }) => {
      const child = spawn(cmd, args, { stdio: "ignore", detached: true });
      child.unref();
      child.on("error", () => {
        // launcher missing — ignore
      });
    });
  } catch {
    // ignore
  }
}
