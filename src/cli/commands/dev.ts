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
import { arrow, bold, cross, cyan, dim, gray, tick } from "../colors.ts";
import type { ParsedOptions } from "../options.ts";
import { getString } from "../options.ts";
import { pkgRoot } from "../paths.ts";
import { resolveDocPath } from "../resolveDocPath.ts";

export async function devCommand(opts: ParsedOptions): Promise<number> {
  let docPath: string;
  try {
    docPath = await resolveDocPath(opts._[0]);
  } catch (err) {
    console.error(`${cross()} ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const file = path.relative(process.cwd(), docPath) || docPath;

  try {
    await access(docPath);
  } catch {
    console.error(`${cross()} ${bold(file)} not found in ${dim(process.cwd())}`);
    console.error(`  Run ${bold("archik init")} to create one, then try again.`);
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
    console.error(`${cross()} archik is already running for ${bold(docPath)}`);
    console.error(`  ${dim("PID")} ${lock.existing.pid} ${dim("on")} ${cyan(url)}`);
    console.error(`  Run ${bold("archik stop")} first.`);
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

  const rule = gray("─".repeat(56));
  console.log("");
  console.log(rule);
  console.log(`  ${tick()} ${bold("archik dev")} ${arrow()} ${cyan(bold(handle.url))}`);
  console.log(rule);
  console.log(`  ${dim("editing")}  ${bold(docPath)}`);
  console.log("");
  console.log(`  ${dim("Press Ctrl+C to stop.")}`);
  console.log("");

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
