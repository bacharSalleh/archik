/**
 * Standalone HTTP server for `archik dev` / `archik start` that replaces
 * the Vite dev server at runtime. Serves the pre-built canvas bundle
 * (dist/ui/), exposes GET/PUT for the project's YAML, and pushes file
 * changes to the browser over SSE. No Vite, no React, no tsx — these
 * stay devDependencies so they don't ship in the published tarball.
 */
import { promises as fs, createReadStream } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import chokidar from "chokidar";

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

  const server = createServer((req, res) => {
    const url = req.url ?? "/";

    if (url === YAML_URL || url.startsWith(YAML_URL + "?")) {
      void handleYaml(docPath, req, res);
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

  // Watch the YAML and notify connected browsers.
  const watcher = chokidar.watch(docPath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 },
  });
  const onChange = (): void => broadcast(clients, "archik:doc-changed");
  watcher.on("change", onChange);
  watcher.on("add", onChange);

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

