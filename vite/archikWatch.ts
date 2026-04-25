import path from "node:path";
import { promises as fs } from "node:fs";
import type { Plugin, ViteDevServer } from "vite";

const FILE_NAME = "architecture.archik.yaml";
const URL_PATH = `/${FILE_NAME}`;
const WS_EVENT = "archik:doc-changed";
const MIME = "application/yaml; charset=utf-8";

export function archikWatch(): Plugin {
  let absPath = "";

  return {
    name: "archik-watch",
    configureServer(server: ViteDevServer) {
      // ARCHIK_DOC_PATH lets the `archik dev` CLI point the dev server at
      // any project's YAML (the canvas runs from Archik's install dir,
      // but the document lives wherever the user is working). Falls back
      // to the file inside the project root for plain `npm run dev`.
      const explicit = process.env["ARCHIK_DOC_PATH"];
      absPath = explicit
        ? path.resolve(explicit)
        : path.resolve(server.config.root, FILE_NAME);

      server.middlewares.use(URL_PATH, async (req, res, next) => {
        if (req.method === "GET" || req.method === "HEAD") {
          try {
            const text = await fs.readFile(absPath, "utf-8");
            res.setHeader("content-type", MIME);
            res.setHeader("cache-control", "no-store");
            if (req.method === "HEAD") {
              res.end();
            } else {
              res.end(text);
            }
          } catch (err) {
            res.statusCode = 404;
            const msg = err instanceof Error ? err.message : String(err);
            res.end(`Not found: ${absPath}\n${msg}`);
          }
          return;
        }
        if (req.method === "PUT") {
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            const body = Buffer.concat(chunks).toString("utf-8");
            await fs.writeFile(absPath, body, "utf-8");
            res.statusCode = 204;
            res.end();
          } catch (err) {
            res.statusCode = 500;
            const msg = err instanceof Error ? err.message : String(err);
            res.end(`Save failed: ${msg}`);
          }
          return;
        }
        return next();
      });

      server.watcher.add(absPath);
      const onChange = (changedPath: string): void => {
        if (path.resolve(changedPath) !== absPath) return;
        server.ws.send({ type: "custom", event: WS_EVENT });
      };
      server.watcher.on("change", onChange);
      server.watcher.on("add", onChange);
    },
  };
}
