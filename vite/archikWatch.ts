import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { suggestionPath } from "../src/domain/suggestion.ts";
import {
  handleAccept,
  handleDiffSvg,
  handleSidecar,
  handleYaml,
} from "../src/server/handlers.ts";

const FILE_NAME = "architecture.archik.yaml";
const YAML_URL = `/${FILE_NAME}`;
// Stable client URL — the on-disk sidecar respects the user's actual
// extension (.yaml or .yml), but the canvas always asks here.
const SIDECAR_URL = `/architecture.archik.suggested.yaml`;
const ACCEPT_URL = "/__archik/accept-suggestion";
const DIFF_SVG_URL = "/__archik/diff.svg";
const DOC_EVENT = "archik:doc-changed";
const SUGGESTION_EVENT = "archik:suggestion-changed";

export function archikWatch(): Plugin {
  let docPath = "";
  let sidecarPath = "";

  return {
    name: "archik-watch",
    configureServer(server: ViteDevServer) {
      // ARCHIK_DOC_PATH lets the `archik dev` CLI point the dev server at
      // any project's YAML (the canvas runs from Archik's install dir,
      // but the document lives wherever the user is working). Falls back
      // to the file inside the project root for plain `npm run dev`.
      const explicit = process.env["ARCHIK_DOC_PATH"];
      docPath = explicit
        ? path.resolve(explicit)
        : path.resolve(server.config.root, FILE_NAME);
      sidecarPath = suggestionPath(docPath);

      server.middlewares.use(YAML_URL, (req, res, next) => {
        if (req.method === undefined) return next();
        void handleYaml(docPath, req, res);
      });

      server.middlewares.use(SIDECAR_URL, (req, res, next) => {
        if (req.method === undefined) return next();
        void handleSidecar(sidecarPath, req, res);
      });

      server.middlewares.use(ACCEPT_URL, (req, res, next) => {
        if (req.method === undefined) return next();
        void handleAccept(docPath, sidecarPath, req, res);
      });

      server.middlewares.use(DIFF_SVG_URL, (_req, res) => {
        void handleDiffSvg(docPath, sidecarPath, res);
      });

      server.watcher.add([docPath, sidecarPath]);
      const onChange = (changedPath: string): void => {
        const resolved = path.resolve(changedPath);
        if (resolved === docPath) {
          server.ws.send({ type: "custom", event: DOC_EVENT });
        } else if (resolved === sidecarPath) {
          server.ws.send({ type: "custom", event: SUGGESTION_EVENT });
        }
      };
      server.watcher.on("change", onChange);
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);
    },
  };
}
