/**
 * Standalone HTTP server for `archik dev` / `archik start` that replaces
 * the Vite dev server at runtime. Serves the pre-built canvas bundle
 * (dist/ui/), exposes GET/PUT for the project's YAML, and pushes file
 * changes to the browser over SSE. No Vite, no React, no tsx — these
 * stay devDependencies so they don't ship in the published tarball.
 */
import { promises as fs, createReadStream } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import chokidar from "chokidar";
import { suggestionPath } from "../domain/suggestion.ts";
import { projectRoot as deriveProjectRoot } from "../cli/resolveDocPath.ts";
import {
  handleAccept,
  handleActors,
  handleAlphas,
  handleArchikAccept,
  handleArchikFile,
  handleDiffSvg,
  handleListFiles,
  handleNodeKinds,
  handleSeqFile,
  handleSidecar,
  handleTrace,
  handleUseCases,
  handleYaml,
} from "./handlers.ts";

export type DevServerOptions = {
  /** Absolute path to the project's architecture YAML. */
  docPath: string;
  /** Directory containing the built UI (index.html + assets/). */
  uiDir: string;
  /** Bind address. Defaults to 127.0.0.1. */
  host?: string;
  /** Preferred port. If taken we walk upward until a free one is found. */
  port?: number;
};

export type DevServerHandle = {
  url: string;
  port: number;
  host: string;
  close(): Promise<void>;
};

// These URLs are stable, hardcoded entry points the canvas knows
// about. They do NOT have to mirror the on-disk filename — the
// server reads/writes the actual `docPath` / `sidecarPath` behind
// the scenes. Keeping them stable means a `.yml` (vs `.yaml`)
// extension on the user's file doesn't break the canvas.
const YAML_URL = "/architecture.archik.yaml";
const SIDECAR_URL = "/architecture.archik.suggested.yaml";
const EVENTS_URL = "/__archik/events";
const ACCEPT_URL = "/__archik/accept-suggestion";
const DIFF_SVG_URL = "/__archik/diff.svg";
/** Generic per-file endpoints — for sub-architectures linked via
 *  a node's `archikFile`. The relative path comes in via `?path=`. */
const FILE_URL = "/__archik/file";
const FILE_ACCEPT_URL = "/__archik/file-accept";
/** List every archik file under the project root, with a
 *  has-suggestion flag — drives the file-switcher dropdown. */
const FILES_URL = "/__archik/files";
const SEQ_FILE_URL = "/__archik/seq-file";
const NODE_KINDS_URL = "/__archik/node-kinds";
/** Read-only JSON endpoints surfacing the M1-M4 artifacts to the
 *  canvas. Each mirrors a `--json` CLI shape 1:1 so the UI never
 *  has to re-implement validation logic. */
const USECASES_URL = "/__archik/usecases";
const ACTORS_URL = "/__archik/actors";
const ALPHAS_URL = "/__archik/alphas";
const TRACE_URL = "/__archik/trace";
const SSE_KEEPALIVE_MS = 25_000;


const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

function mimeFor(file: string): string {
  return MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
}

/** Pull the `path` query param out of a `/__archik/file?path=…` URL.
 *  Returns "" when missing — the handler then rejects with a 400. */
function parsePathParam(url: string): string {
  const q = url.indexOf("?");
  if (q < 0) return "";
  const params = new URLSearchParams(url.slice(q + 1));
  return params.get("path") ?? "";
}

/** Refuse paths that try to escape the UI directory. */
function safeJoin(root: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const candidate = normalize(join(root, decoded));
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  return candidate;
}

async function serveStatic(
  uiDir: string,
  url: string,
  res: ServerResponse,
): Promise<void> {
  const target = safeJoin(uiDir, url === "/" ? "/index.html" : url);
  if (!target) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  let filePath = target;
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    // SPA fallback — unknown routes serve index.html so client
    // routing works. But never fall back for data-file extensions:
    // returning HTML where the client expects YAML/JSON silently
    // corrupts state (the parser sees a string at the root and
    // emits a baffling "expected object" error).
    const ext = extname(filePath).toLowerCase();
    if (ext === ".yaml" || ext === ".yml" || ext === ".json") {
      res.statusCode = 404;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("Not found");
      return;
    }
    filePath = join(uiDir, "index.html");
  }

  try {
    const stat = await fs.stat(filePath);
    res.statusCode = 200;
    res.setHeader("content-type", mimeFor(filePath));
    res.setHeader("content-length", stat.size);
    res.setHeader("cache-control", "no-cache");
    createReadStream(filePath).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}


type SseClient = {
  res: ServerResponse;
  keepAlive: NodeJS.Timeout;
};

function attachSse(res: ServerResponse): SseClient {
  res.statusCode = 200;
  res.setHeader("content-type", "text/event-stream; charset=utf-8");
  res.setHeader("cache-control", "no-cache, no-transform");
  res.setHeader("connection", "keep-alive");
  res.setHeader("x-accel-buffering", "no");
  // Hint the client to retry quickly if we drop.
  res.write("retry: 1000\n\n");
  const keepAlive = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      // socket gone — cleaned up below
    }
  }, SSE_KEEPALIVE_MS);
  return { res, keepAlive };
}

function broadcast(clients: Set<SseClient>, event: string): void {
  const payload = `event: ${event}\ndata: {}\n\n`;
  for (const c of clients) {
    try {
      c.res.write(payload);
    } catch {
      // dead — will be reaped on the close handler
    }
  }
}

async function findFreePort(host: string, start: number): Promise<number> {
  for (let port = start; port < start + 50; port++) {
    const taken = await new Promise<boolean>((resolveProbe) => {
      const probe = createServer();
      probe.once("error", () => {
        probe.close();
        resolveProbe(true);
      });
      probe.listen(port, host, () => {
        probe.close(() => resolveProbe(false));
      });
    });
    if (!taken) return port;
  }
  throw new Error(`no free port found in [${start}, ${start + 50})`);
}

export async function startDevServer(
  options: DevServerOptions,
): Promise<DevServerHandle> {
  const docPath = resolve(options.docPath);
  const uiDir = resolve(options.uiDir);
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port ?? 5173;

  // Verify the UI bundle exists — friendlier than a 404 storm later.
  try {
    await fs.access(join(uiDir, "index.html"));
  } catch {
    throw new Error(
      `UI bundle missing at ${uiDir}. ` +
        `Run \`npm run build\` from the archik checkout, or reinstall.`,
    );
  }

  const port = await findFreePort(host, requestedPort);
  const clients = new Set<SseClient>();
  // On-disk sidecar lives next to the YAML (`<stem>.suggested<ext>`),
  // matching the user's real extension. The client always asks at
  // the stable SIDECAR_URL above.
  const sidecarPath = suggestionPath(docPath);
  // Project root for sub-file resolution: parent of `.archik/` if
  // the doc is under there, else the doc's own directory.
  const root = deriveProjectRoot(docPath);

  const server = createServer((req, res) => {
    const url = req.url ?? "/";

    if (url === YAML_URL || url.startsWith(YAML_URL + "?")) {
      void handleYaml(docPath, root, req, res);
      return;
    }

    if (url === SIDECAR_URL || url.startsWith(SIDECAR_URL + "?")) {
      void handleSidecar(sidecarPath, root, req, res);
      return;
    }

    if (url === ACCEPT_URL) {
      void handleAccept(docPath, sidecarPath, req, res);
      return;
    }

    if (url === DIFF_SVG_URL || url.startsWith(DIFF_SVG_URL + "?")) {
      void handleDiffSvg(docPath, sidecarPath, res);
      return;
    }

    // Generic per-file endpoint. Used when the canvas drills into a
    // sub-architecture via a node's `archikFile`. The `path` query
    // param is the relative path of the file to read/write.
    if (url === FILE_URL || url.startsWith(FILE_URL + "?")) {
      const rel = parsePathParam(url);
      void handleArchikFile(root, rel, req, res);
      return;
    }

    if (url === FILE_ACCEPT_URL || url.startsWith(FILE_ACCEPT_URL + "?")) {
      const rel = parsePathParam(url);
      void handleArchikAccept(root, rel, req, res);
      return;
    }

    if (url === FILES_URL || url.startsWith(FILES_URL + "?")) {
      void handleListFiles(root, docPath, req, res);
      return;
    }

    if (url === SEQ_FILE_URL || url.startsWith(SEQ_FILE_URL + "?")) {
      void handleSeqFile(root, req, res);
      return;
    }

    if (url === NODE_KINDS_URL || url.startsWith(NODE_KINDS_URL + "?")) {
      void handleNodeKinds(root, docPath, res);
      return;
    }

    if (url === USECASES_URL || url.startsWith(USECASES_URL + "?")) {
      void handleUseCases(root, req, res);
      return;
    }

    if (url === ACTORS_URL || url.startsWith(ACTORS_URL + "?")) {
      void handleActors(root, req, res);
      return;
    }

    if (url === ALPHAS_URL || url.startsWith(ALPHAS_URL + "?")) {
      void handleAlphas(root, docPath, req, res);
      return;
    }

    if (url === TRACE_URL || url.startsWith(TRACE_URL + "?")) {
      void handleTrace(root, docPath, req, res);
      return;
    }

    if (url === EVENTS_URL) {
      const client = attachSse(res);
      clients.add(client);
      // Wrap clearInterval defensively: if it ever throws, the second
      // statement (clients.delete) wouldn't run and the client + its
      // keepAlive timer would leak forever. Cheap insurance.
      const drop = () => {
        try {
          clearInterval(client.keepAlive);
        } catch {
          // ignore — we still want to drop the client from the Set.
        }
        clients.delete(client);
      };
      req.on("close", drop);
      req.on("error", drop);
      return;
    }

    void serveStatic(uiDir, url, res);
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolveListen();
    });
  });

  // Watch the YAML, its sidecar, AND the project's .archik/ folder
  // (if any). Sub-files live under .archik/ — touching one of them
  // should also fire an SSE so the canvas can refetch when it's
  // currently looking at it.
  const watchTargets = [docPath, sidecarPath, join(root, ".archik")];
  const watcher = chokidar.watch(watchTargets, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 },
  });
  const onChange = (changedPath: string): void => {
    // Anything ending in .archik.suggested.yaml is a sidecar — the
    // banner pickup logic listens for that. Other archik files are
    // doc changes; the canvas refetches whichever file it's loaded.
    const event = changedPath.endsWith(".archik.suggested.yaml")
      ? "archik:suggestion-changed"
      : "archik:doc-changed";
    broadcast(clients, event);
  };
  watcher.on("change", onChange);
  watcher.on("add", onChange);
  watcher.on("unlink", onChange);

  const url = `http://${host === "0.0.0.0" ? "localhost" : host}:${port}/`;

  return {
    url,
    port,
    host,
    async close(): Promise<void> {
      await watcher.close();
      for (const c of clients) {
        clearInterval(c.keepAlive);
        try {
          c.res.end();
        } catch {
          // ignore
        }
      }
      clients.clear();
      await new Promise<void>((res) => server.close(() => res()));
      // Give sockets a tick to finish closing on slow runners.
      await sleep(10);
    },
  };
}

