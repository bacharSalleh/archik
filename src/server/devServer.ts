/**
 * Standalone HTTP server for `archik dev` / `archik start` that replaces
 * the Vite dev server at runtime. Serves the pre-built canvas bundle
 * (dist/ui/), exposes GET/PUT for the project's YAML, and pushes file
 * changes to the browser over SSE. No Vite, no React, no tsx — these
 * stay devDependencies so they don't ship in the published tarball.
 */
import { promises as fs, createReadStream } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, extname, join, normalize, resolve, sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import chokidar from "chokidar";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { diffDocuments, mergeForDiff, statusMap } from "../domain/diff.ts";
import { suggestionPath, stripSuggestionMarker } from "../domain/suggestion.ts";
import { parseYaml, stringifyYaml } from "../io/yaml.ts";
import { layout } from "../layout/index.ts";
import { DiffSvg } from "../render/DiffSvg.tsx";

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

const YAML_URL = "/architecture.archik.yaml";
const EVENTS_URL = "/__archik/events";
const ACCEPT_URL = "/__archik/accept-suggestion";
const DIFF_SVG_URL = "/__archik/diff.svg";
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
    // SPA fallback — any unknown route serves index.html so client routing works.
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

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * The dev server only listens on loopback by default, but a
 * cross-origin page in the browser (e.g. a malicious site visited
 * while `archik dev` is running) can still issue a fetch() PUT to
 * 127.0.0.1 because browsers don't block cross-origin writes by
 * default — only reads. So we explicitly check:
 *
 *   * `Host` is loopback (defends against DNS rebinding from a
 *     resolver that points the attacker's domain at our local IP).
 *   * If `Origin` is present, it must match Host (only the canvas
 *     served by this same server is allowed to mutate the YAML).
 *
 * Read paths (GET/HEAD) skip the check — they're idempotent and the
 * canvas often loads from a slightly different host string.
 */
function isWriteAllowed(req: IncomingMessage): boolean {
  const host = req.headers["host"];
  if (typeof host !== "string") return false;
  const hostName = host.split(":")[0]!.toLowerCase();
  if (
    hostName !== "localhost" &&
    hostName !== "127.0.0.1" &&
    hostName !== "[::1]" &&
    hostName !== "::1"
  ) {
    return false;
  }
  const origin = req.headers["origin"];
  if (typeof origin === "string" && origin.length > 0) {
    try {
      const u = new URL(origin);
      if (u.host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * GET / HEAD / PUT / DELETE for the suggestion sidecar. Same
 * loopback + same-origin write protection as the main YAML.
 */
async function handleSidecar(
  sidecarPath: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method === "GET" || req.method === "HEAD") {
    try {
      const text = await fs.readFile(sidecarPath, "utf-8");
      res.statusCode = 200;
      res.setHeader("content-type", "application/yaml; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      if (req.method === "HEAD") res.end();
      else res.end(text);
    } catch {
      res.statusCode = 404;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("No suggestion pending.");
    }
    return;
  }
  if (req.method === "PUT") {
    if (!isWriteAllowed(req)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }
    try {
      const body = await readBody(req);
      await fs.writeFile(sidecarPath, body, "utf-8");
      res.statusCode = 204;
      res.end();
    } catch (err) {
      res.statusCode = 500;
      res.end(err instanceof Error ? err.message : String(err));
    }
    return;
  }
  if (req.method === "DELETE") {
    if (!isWriteAllowed(req)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }
    try {
      await fs.unlink(sidecarPath);
    } catch {
      // already gone — treat as success (idempotent reject).
    }
    res.statusCode = 204;
    res.end();
    return;
  }
  res.statusCode = 405;
  res.setHeader("allow", "GET, HEAD, PUT, DELETE");
  res.end();
}

/**
 * POST endpoint that accepts the suggestion: read sidecar, validate,
 * strip the suggestion marker, write to main, delete sidecar.
 */
async function handleAccept(
  mainPath: string,
  sidecarPath: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("allow", "POST");
    res.end();
    return;
  }
  if (!isWriteAllowed(req)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }
  try {
    const text = await fs.readFile(sidecarPath, "utf-8");
    const doc = parseYaml(text); // Zod-validates incl. cross-refs
    const cleaned = stripSuggestionMarker(doc);
    await fs.writeFile(mainPath, stringifyYaml(cleaned), "utf-8");
    await fs.unlink(sidecarPath);
    res.statusCode = 204;
    res.end();
  } catch (err) {
    res.statusCode = 400;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Server-side render the diff between main YAML and the suggestion
 * sidecar, returning a self-contained SVG. The canvas opens this in
 * a new tab when the user clicks "Review" on the suggestion banner.
 */
async function handleDiffSvg(
  mainPath: string,
  sidecarPath: string,
  res: ServerResponse,
): Promise<void> {
  try {
    const [mainText, sidecarText] = await Promise.all([
      fs.readFile(mainPath, "utf-8"),
      fs.readFile(sidecarPath, "utf-8"),
    ]);
    const mainDoc = parseYaml(mainText);
    const sidecarDoc = parseYaml(sidecarText);
    const merged = mergeForDiff(mainDoc, sidecarDoc);
    const positioned = await layout(merged);
    const diff = diffDocuments(mainDoc, sidecarDoc);
    const svg = renderToStaticMarkup(
      createElement(DiffSvg, { positioned, statuses: statusMap(diff) }),
    );
    res.statusCode = 200;
    res.setHeader("content-type", "image/svg+xml; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(`<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`);
  } catch (err) {
    res.statusCode = 404;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(err instanceof Error ? err.message : String(err));
  }
}

async function handleYaml(
  docPath: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method === "GET" || req.method === "HEAD") {
    try {
      const text = await fs.readFile(docPath, "utf-8");
      res.statusCode = 200;
      res.setHeader("content-type", "application/yaml; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      if (req.method === "HEAD") {
        res.end();
      } else {
        res.end(text);
      }
    } catch (err) {
      res.statusCode = 404;
      res.end(err instanceof Error ? err.message : String(err));
    }
    return;
  }
  if (req.method === "PUT") {
    if (!isWriteAllowed(req)) {
      res.statusCode = 403;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(
        "Forbidden: PUT must come from a same-origin loopback page.",
      );
      return;
    }
    try {
      const body = await readBody(req);
      await fs.writeFile(docPath, body, "utf-8");
      res.statusCode = 204;
      res.end();
    } catch (err) {
      res.statusCode = 500;
      res.end(err instanceof Error ? err.message : String(err));
    }
    return;
  }
  res.statusCode = 405;
  res.setHeader("allow", "GET, HEAD, PUT");
  res.end();
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
  const sidecarPath = suggestionPath(docPath);
  // The on-disk file lives next to the YAML (`<stem>.suggested<ext>`);
  // expose it on the same URL stem so the canvas can fetch / save it.
  const sidecarFilename = basename(sidecarPath);
  const SIDECAR_URL = `/${sidecarFilename}`;

  const server = createServer((req, res) => {
    const url = req.url ?? "/";

    if (url === YAML_URL || url.startsWith(YAML_URL + "?")) {
      void handleYaml(docPath, req, res);
      return;
    }

    if (url === SIDECAR_URL || url.startsWith(SIDECAR_URL + "?")) {
      void handleSidecar(sidecarPath, req, res);
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

    if (url === EVENTS_URL) {
      const client = attachSse(res);
      clients.add(client);
      const drop = () => {
        clearInterval(client.keepAlive);
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

  // Watch the YAML and the sidecar; broadcast a change event for either
  // so the canvas knows to reload the doc / banner.
  const watcher = chokidar.watch([docPath, sidecarPath], {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 },
  });
  const onChange = (changedPath: string): void => {
    const event =
      changedPath === sidecarPath
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

