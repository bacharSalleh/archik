import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { suggestionPath } from "../src/domain/suggestion.ts";
import {
  projectRoot as deriveProjectRoot,
  resolveDocPath,
} from "../src/cli/resolveDocPath.ts";
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
} from "../src/server/handlers.ts";

// Stable client URLs — the canvas always asks at these paths, no
// matter where the doc actually lives on disk (root or .archik/).
const YAML_URL = `/architecture.archik.yaml`;
const SIDECAR_URL = `/architecture.archik.suggested.yaml`;
// Generic per-file endpoint for sub-architectures.
const FILE_URL = `/__archik/file`;
const FILE_ACCEPT_URL = `/__archik/file-accept`;
const FILES_URL = `/__archik/files`;
const SEQ_FILE_URL = `/__archik/seq-file`;
const NODE_KINDS_URL = `/__archik/node-kinds`;
const ACCEPT_URL = "/__archik/accept-suggestion";
const DIFF_SVG_URL = "/__archik/diff.svg";
// Read-only JSON endpoints surfacing M1-M4 artifacts to the canvas.
const USECASES_URL = `/__archik/usecases`;
const ACTORS_URL = `/__archik/actors`;
const ALPHAS_URL = `/__archik/alphas`;
const TRACE_URL = `/__archik/trace`;
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
      const root = deriveProjectRoot(docPath);

      server.middlewares.use(YAML_URL, (req, res, next) => {
        if (req.method === undefined) return next();
        void handleYaml(docPath, root, req, res);
      });

      server.middlewares.use(SIDECAR_URL, (req, res, next) => {
        if (req.method === undefined) return next();
        void handleSidecar(sidecarPath, root, req, res);
      });

      server.middlewares.use(ACCEPT_URL, (req, res, next) => {
        if (req.method === undefined) return next();
        void handleAccept(docPath, sidecarPath, req, res);
      });

      server.middlewares.use(DIFF_SVG_URL, (_req, res) => {
        void handleDiffSvg(docPath, sidecarPath, res);
      });

      server.middlewares.use(FILE_URL, (req, res, next) => {
        if (req.method === undefined) return next();
        const rel = parsePathParam(req.url ?? "");
        void handleArchikFile(root, rel, req, res);
      });

      server.middlewares.use(FILE_ACCEPT_URL, (req, res, next) => {
        if (req.method === undefined) return next();
        const rel = parsePathParam(req.url ?? "");
        void handleArchikAccept(root, rel, req, res);
      });

      server.middlewares.use(FILES_URL, (req, res, next) => {
        if (req.method === undefined) return next();
        void handleListFiles(root, docPath, req, res);
      });

      server.middlewares.use(SEQ_FILE_URL, (req, res, next) => {
        if (req.method === undefined) return next();
        void handleSeqFile(root, req, res);
      });

      server.middlewares.use(NODE_KINDS_URL, (_req, res) => {
        void handleNodeKinds(root, docPath, res);
      });

      server.middlewares.use(USECASES_URL, (req, res, next) => {
        if (req.method === undefined) return next();
        void handleUseCases(root, req, res);
      });

      server.middlewares.use(ACTORS_URL, (req, res, next) => {
        if (req.method === undefined) return next();
        void handleActors(root, req, res);
      });

      server.middlewares.use(ALPHAS_URL, (req, res, next) => {
        if (req.method === undefined) return next();
        void handleAlphas(root, docPath, req, res);
      });

      server.middlewares.use(TRACE_URL, (req, res, next) => {
        if (req.method === undefined) return next();
        void handleTrace(root, docPath, req, res);
      });

      // Watch the main file, its sidecar, and the project's .archik/
      // folder so sub-file edits also fire SSE for the live canvas.
      server.watcher.add([docPath, sidecarPath, path.join(root, ".archik")]);
      const onChange = (changedPath: string): void => {
        const resolved = path.resolve(changedPath);
        if (resolved.endsWith(".archik.suggested.yaml")) {
          server.ws.send({ type: "custom", event: SUGGESTION_EVENT });
        } else if (
          resolved === docPath ||
          resolved.endsWith(".archik.yaml")
        ) {
          server.ws.send({ type: "custom", event: DOC_EVENT });
        }
      };
      server.watcher.on("change", onChange);
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);
    },
  };
}

function parsePathParam(url: string): string {
  const q = url.indexOf("?");
  if (q < 0) return "";
  const params = new URLSearchParams(url.slice(q + 1));
  return params.get("path") ?? "";
}
