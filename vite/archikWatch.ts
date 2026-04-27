import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { suggestionPath } from "../src/domain/suggestion.ts";
import { resolveDocPath } from "../src/cli/resolveDocPath.ts";
import {
  handleAccept,
  handleDiffSvg,
  handleSidecar,
  handleYaml,
} from "../src/server/handlers.ts";

// Stable client URLs — the canvas always asks at these paths, no
// matter where the doc actually lives on disk (root or .archik/).
const YAML_URL = `/architecture.archik.yaml`;
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
    async configureServer(server: ViteDevServer) {
      // ARCHIK_DOC_PATH lets the `archik dev` CLI point the dev server at
      // any project's YAML (the canvas runs from Archik's install dir,
      // but the document lives wherever the user is working). Without
      // it, fall back to the resolver — which prefers the legacy
      // architecture.archik.yaml in root, else the new
      // .archik/main.archik.yaml convention. Plain `npm run dev` from
      // the archik checkout therefore picks up whichever layout the
      // repo currently uses.
      const explicit = process.env["ARCHIK_DOC_PATH"];
      docPath = explicit
        ? path.resolve(explicit)
        : await resolveDocPath(undefined, server.config.root);
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
