/**
 * HTTP request handlers for the archik project's dev surface
 * (main YAML, suggestion sidecar, accept POST, diff SVG).
 *
 * Shared between the standalone `archik dev` server (devServer.ts)
 * and the Vite plugin used by `npm run dev` from this repo
 * (vite/archikWatch.ts). Keeping the surface in one place is the
 * only way to keep dogfooding honest — otherwise the two paths
 * drift and bugs surface in one but not the other.
 */
import { existsSync, promises as fs } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { diffDocuments, mergeForDiff, statusMap } from "../domain/diff.ts";
import {
  archikFileMode,
  stripSuggestionMarker,
  suggestionPath,
} from "../domain/suggestion.ts";
import {
  checkCrossFileReferences,
  checkSourcePaths,
  formatErrors,
  validateDocument,
} from "../domain/validate.ts";
import { discoverDocs } from "../io/discovery.ts";
import { discoverActorDocs } from "../io/actor-discovery.ts";
import { discoverAlphaDoc } from "../io/alpha-discovery.ts";
import { discoverSeqDocs } from "../io/seq-discovery.ts";
import { discoverUseCaseDocs } from "../io/usecase-discovery.ts";
import {
  ALPHA_NAMES,
  STATE_LADDERS,
  stateIndex,
  type AlphaName,
} from "../domain/alpha-schema.ts";
import { evaluateAlphaState } from "../domain/alpha-checks.ts";
import { buildTraceMatrix } from "../domain/trace.ts";
import { parseYaml, stringifyYaml } from "../io/yaml.ts";
import { layout } from "../layout/index.ts";
import { DiffSvg } from "../render/DiffSvg.tsx";

/**
 * Validate a YAML payload destined for `targetPath` (the file the
 * canvas is about to PUT). Returns null on success or a
 * human-readable error block on failure — callers surface it as
 * a 400 so the canvas knows the write was rejected (e.g.
 * parent↔child edge, missing sourcePath, missing description).
 *
 * Accepts the project root so cross-file / sourcePath existence
 * checks resolve from the same place validate / suggest set use.
 */
function validateYamlPayload(
  body: string,
  targetPath: string,
  projectRoot: string,
): string | null {
  let parsed: unknown;
  try {
    parsed = parseYaml(body);
  } catch (err) {
    return `Invalid YAML: ${err instanceof Error ? err.message : String(err)}`;
  }
  const result = validateDocument(parsed);
  if (!result.ok) {
    return `Schema validation failed:\n${formatErrors(result.errors)}`;
  }
  const exists = (rel: string): boolean =>
    existsSync(path.resolve(projectRoot, rel));
  const cross = checkCrossFileReferences(result.value, exists);
  if (cross.length > 0) {
    return `Cross-file reference errors:\n${formatErrors(cross)}`;
  }
  // Sidecar files validate under the rules of the file they propose
  // changes to (the main file), not their own filename mode — the
  // sidecar will become the main file on accept.
  const baseName = path.basename(targetPath);
  const targetForMode = baseName.endsWith(".archik.suggested.yaml")
    ? targetPath.replace(/\.archik\.suggested\.yaml$/, ".archik.yaml")
    : targetPath;
  const mode = archikFileMode(targetForMode);
  const sp = checkSourcePaths(result.value, mode, exists);
  if (sp.length > 0) {
    return `sourcePath validation failed:\n${formatErrors(sp)}`;
  }
  return null;
}

/**
 * Defends mutating endpoints against DNS-rebinding / cross-origin
 * abuse. Read paths skip this — they're idempotent.
 */
export function isWriteAllowed(req: IncomingMessage): boolean {
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

export async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Atomic write via tmp + rename. fs.writeFile is not atomic on POSIX
 * — a partial write (ENOSPC, signal, OOM kill) would leave the user's
 * source-of-truth YAML truncated. Renaming on the same filesystem is
 * atomic, so if anything goes wrong the original file stays intact.
 */
async function atomicWrite(target: string, data: string): Promise<void> {
  const tmp = `${target}.archik-tmp-${randomUUID().slice(0, 8)}`;
  try {
    await fs.writeFile(tmp, data, "utf-8");
    await fs.rename(tmp, target);
  } catch (err) {
    try {
      await fs.unlink(tmp);
    } catch {
      // Tmp may not exist if writeFile failed before creating it.
    }
    throw err;
  }
}

export async function handleYaml(
  docPath: string,
  projectRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method === "GET" || req.method === "HEAD") {
    try {
      const text = await fs.readFile(docPath, "utf-8");
      res.statusCode = 200;
      res.setHeader("content-type", "application/yaml; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      if (req.method === "HEAD") res.end();
      else res.end(text);
      return;
    } catch (err) {
      // Orphan-suggestion fallback: when the main file doesn't exist
      // but its sidecar does (i.e., a `--allow-orphan` suggest set
      // proposed a brand-new sub-architecture that hasn't been
      // accepted), serve the sidecar so the canvas can drill into
      // the pending file. The X-Archik-Source header tells the UI
      // it's viewing a suggestion, not a saved file, so it can show
      // a banner instead of pretending the file is real.
      if (docPath.endsWith(".archik.yaml")) {
        const sidecar = suggestionPath(docPath);
        try {
          const text = await fs.readFile(sidecar, "utf-8");
          res.statusCode = 200;
          res.setHeader("content-type", "application/yaml; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.setHeader("x-archik-source", "suggested-orphan");
          if (req.method === "HEAD") res.end();
          else res.end(text);
          return;
        } catch {
          // Fall through to 404 below.
        }
      }
      res.statusCode = 404;
      res.end(err instanceof Error ? err.message : String(err));
    }
    return;
  }
  if (req.method === "PUT") {
    if (!isWriteAllowed(req)) {
      res.statusCode = 403;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("Forbidden: PUT must come from a same-origin loopback page.");
      return;
    }
    try {
      const body = await readBody(req);
      const validationError = validateYamlPayload(body, docPath, projectRoot);
      if (validationError !== null) {
        res.statusCode = 400;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end(validationError);
        return;
      }
      await atomicWrite(docPath, body);
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

export async function handleSidecar(
  sidecarPath: string,
  projectRoot: string,
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
      const validationError = validateYamlPayload(body, sidecarPath, projectRoot);
      if (validationError !== null) {
        res.statusCode = 400;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end(validationError);
        return;
      }
      await atomicWrite(sidecarPath, body);
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
      // already gone — idempotent reject.
    }
    res.statusCode = 204;
    res.end();
    return;
  }
  res.statusCode = 405;
  res.setHeader("allow", "GET, HEAD, PUT, DELETE");
  res.end();
}

export async function handleAccept(
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
  // Validate fully BEFORE touching the main file so a broken sidecar
  // can't corrupt the source of truth. Then ENOENT-swallow on unlink
  // so a concurrent reject doesn't make us look like we failed.
  let cleaned: string;
  try {
    const text = await fs.readFile(sidecarPath, "utf-8");
    const doc = parseYaml(text);
    cleaned = stringifyYaml(stripSuggestionMarker(doc));
  } catch (err) {
    res.statusCode = 400;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(err instanceof Error ? err.message : String(err));
    return;
  }
  try {
    await atomicWrite(mainPath, cleaned);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(
      `Failed to write main file: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }
  try {
    await fs.unlink(sidecarPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      res.statusCode = 207;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(
        `Main file accepted, but sidecar still on disk: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
  }
  res.statusCode = 204;
  res.end();
}

/**
 * Resolve a relative archik path against the project root, refusing
 * anything that escapes the root or doesn't end in `.archik.yaml`
 * (or `.archik.suggested.yaml` for sidecars). Returns the absolute
 * path, or `null` if the request should be rejected.
 *
 * This is the *only* trust boundary for sub-file requests — the
 * canvas can ask for any path it likes, but we'll only serve files
 * that pass these checks.
 */
export function safeResolveProjectFile(
  projectRoot: string,
  relPath: string,
): string | null {
  if (typeof relPath !== "string" || relPath.length === 0) return null;
  // Decoded by the time we get here, but be defensive: normalize
  // away any redundant `./` or trailing slashes, and keep forward
  // slashes only.
  if (relPath.includes("\\")) return null;
  if (relPath.startsWith("/")) return null;
  if (/^[a-zA-Z]:[\\/]/.test(relPath)) return null;
  const normalRoot = path.resolve(projectRoot);
  const candidate = path.resolve(normalRoot, relPath);
  if (candidate !== normalRoot && !candidate.startsWith(normalRoot + path.sep)) {
    return null;
  }
  if (
    !candidate.endsWith(".archik.yaml") &&
    !candidate.endsWith(".archik.suggested.yaml")
  ) {
    return null;
  }
  return candidate;
}

/**
 * Walk the project root and enumerate every archik file, with a
 * `hasSuggestion` flag if a `<stem>.suggested.yaml` is sitting
 * next to it. Used by the file-switcher dropdown so the canvas
 * can show peer files and pending-suggestion badges.
 */
export async function listArchikFiles(
  projectRoot: string,
  /** Absolute path of the canonical root file (whichever
   *  `resolveDocPath` picked). The matching entry in the result is
   *  flagged `isRoot: true` so the canvas knows to use the stable
   *  `/architecture.archik.yaml` URL for it instead of the
   *  per-file endpoint. */
  rootDocPath?: string,
): Promise<
  Array<{
    path: string;
    name: string;
    hasSuggestion: boolean;
    isRoot: boolean;
    /** True when this entry has no sibling main file on disk — only
     *  the suggestion sidecar exists. The canvas renders these
     *  distinctly ("(pending)") so the user can review and accept
     *  before they become real architecture files. */
    isOrphanSuggestion?: boolean;
  }>
> {
  const root = path.resolve(projectRoot);
  const canonicalRoot =
    rootDocPath !== undefined ? path.resolve(rootDocPath) : null;
  const found = new Set<string>();

  // The convention is: the canonical root file lives either at the
  // project root (legacy `architecture.archik.yaml`) or under
  // `.archik/main.archik.yaml`. Sub-architectures live under
  // `.archik/`. We deliberately do NOT walk the rest of the tree —
  // a `*.archik.yaml` under `docs/`, `examples/`, fixtures, etc. is
  // sample / documentation material, not part of the project's own
  // architecture, and showing it in the file switcher just confuses
  // the user about what their actual map is.
  const isArchikYaml = (name: string): boolean =>
    name.endsWith(".archik.yaml") &&
    !name.endsWith(".archik.suggested.yaml");

  // 1. Legacy root file, if present.
  try {
    const legacy = path.join(root, "architecture.archik.yaml");
    await fs.access(legacy);
    found.add(legacy);
  } catch {
    // not present — fine
  }

  // 2. Everything under `.archik/`, recursive (depth-limited so a
  // pathological symlink tree can't trap us). We collect both
  // canonical archik files AND `.archik.suggested.yaml` sidecars,
  // then resolve them below — a sidecar without a sibling main is
  // an "orphan" that the canvas surfaces as a pending entry.
  const MAX_DEPTH = 6;
  const orphanSidecars = new Set<string>();
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else if (entry.isFile() && isArchikYaml(entry.name)) {
        found.add(full);
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".archik.suggested.yaml")
      ) {
        orphanSidecars.add(full);
      }
    }
  };
  await walk(path.join(root, ".archik"), 0);

  // Drop sidecars whose sibling main is in `found` — those are
  // normal pending suggestions, surfaced via `hasSuggestion: true`
  // on the main entry, not as standalone orphans.
  for (const abs of orphanSidecars) {
    const sibling = abs.replace(/\.archik\.suggested\.yaml$/, ".archik.yaml");
    if (found.has(sibling)) orphanSidecars.delete(abs);
  }

  const out: Array<{
    path: string;
    name: string;
    hasSuggestion: boolean;
    isRoot: boolean;
    isOrphanSuggestion?: boolean;
  }> = [];
  for (const abs of found) {
    const rel = path.relative(root, abs).split(path.sep).join("/");
    const sidecar = suggestionPath(abs);
    let hasSuggestion = false;
    try {
      await fs.access(sidecar);
      hasSuggestion = true;
    } catch {
      // no sidecar — fine
    }
    // Friendly label: the basename without extensions, with the
    // canonical legacy file getting "main" instead of "architecture".
    const base = path.basename(rel).replace(/\.archik\.yaml$/, "");
    const name = base === "architecture" ? "main" : base;
    const isRoot = canonicalRoot !== null && abs === canonicalRoot;
    out.push({ path: rel, name, hasSuggestion, isRoot });
  }
  // Append orphan suggestion entries. Their `path` points at the
  // sidecar itself (the only file on disk), and the canvas knows to
  // load that path when the entry is selected.
  for (const abs of orphanSidecars) {
    const rel = path.relative(root, abs).split(path.sep).join("/");
    const base = path
      .basename(rel)
      .replace(/\.archik\.suggested\.yaml$/, "");
    const name = base === "architecture" ? "main" : base;
    out.push({
      path: rel,
      name,
      hasSuggestion: true,
      isRoot: false,
      isOrphanSuggestion: true,
    });
  }
  // Stable order: legacy root file first (if any), then alphabetical.
  out.sort((a, b) => {
    const aRoot = !a.path.includes("/");
    const bRoot = !b.path.includes("/");
    if (aRoot !== bRoot) return aRoot ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
  return out;
}

/**
 * GET handler for `/__archik/files`. Returns the JSON list above.
 * Read-only; no PUT / DELETE.
 */
export async function handleListFiles(
  projectRoot: string,
  rootDocPath: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("allow", "GET, HEAD");
    res.end();
    return;
  }
  try {
    const files = await listArchikFiles(projectRoot, rootDocPath);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    if (req.method === "HEAD") {
      res.end();
    } else {
      res.end(JSON.stringify({ files }));
    }
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Generic file handler: GET / PUT a project archik file at any
 * relative path under the project root. Used by the canvas when
 * navigating into a sub-architecture pointed at by a node's
 * `archikFile`. Dispatches to handleYaml or handleSidecar based
 * on the extension.
 */
export async function handleArchikFile(
  projectRoot: string,
  relPath: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const abs = safeResolveProjectFile(projectRoot, relPath);
  if (abs === null) {
    res.statusCode = 400;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(
      "Bad path: must be a relative .archik.yaml file under the project root.",
    );
    return;
  }
  if (abs.endsWith(".archik.suggested.yaml")) {
    return handleSidecar(abs, projectRoot, req, res);
  }
  return handleYaml(abs, projectRoot, req, res);
}

/**
 * Accept-suggestion for a sub-file. Derives the sidecar path with
 * `suggestionPath` so the same atomic accept logic works regardless
 * of which file the canvas is currently editing.
 */
export async function handleArchikAccept(
  projectRoot: string,
  relPath: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const main = safeResolveProjectFile(projectRoot, relPath);
  if (main === null || main.endsWith(".archik.suggested.yaml")) {
    res.statusCode = 400;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Bad path: accept needs the main file path, not the sidecar.");
    return;
  }
  return handleAccept(main, suggestionPath(main), req, res);
}

export async function handleSeqFile(
  projectRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const relPath = url.searchParams.get("path");
  if (
    !relPath ||
    relPath.startsWith("/") ||
    relPath.includes("\\") ||
    /^[a-zA-Z]:[\\/]/.test(relPath) ||
    !relPath.endsWith(".archik.seq.yaml")
  ) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("path must end in .archik.seq.yaml");
    return;
  }
  const normalRoot = path.resolve(projectRoot);
  const abs = path.resolve(normalRoot, relPath);
  if (abs !== normalRoot && !abs.startsWith(normalRoot + path.sep)) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("path escapes project root");
    return;
  }
  let text: string;
  try {
    text = await fs.readFile(abs, "utf-8");
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(`Not Found: ${relPath}`);
    return;
  }
  res.writeHead(200, { "Content-Type": "text/yaml; charset=utf-8" });
  res.end(text);
}

export async function handleNodeKinds(
  projectRoot: string,
  rootDocPath: string,
  res: ServerResponse,
): Promise<void> {
  const discovery = await discoverDocs(rootDocPath, projectRoot);
  const kinds: Record<string, string> = {};
  for (const { doc } of discovery.docs) {
    for (const node of doc.nodes) {
      kinds[node.id] = node.kind;
    }
  }
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(kinds));
}

export async function handleDiffSvg(
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

// ============================================================================
//  Use cases / actors / alphas / trace — read-only JSON endpoints
// ----------------------------------------------------------------------------
//  These mirror the CLI's --json shapes 1:1 so the canvas (and any other
//  HTTP client) can subscribe to the same artefacts the CLI emits, without
//  shelling out. GET only; non-GET returns 405.
// ============================================================================

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function isGet(req: IncomingMessage): boolean {
  return (req.method ?? "GET").toUpperCase() === "GET";
}

function methodNotAllowed(res: ServerResponse): void {
  res.statusCode = 405;
  res.setHeader("allow", "GET");
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end("Method Not Allowed");
}

/**
 * GET /__archik/usecases
 *   → { ok, count, useCases: [...] }     (mirrors `archik q usecases --json`)
 * GET /__archik/usecases?id=<id>
 *   → { ok, file, useCase }              (mirrors `archik q describe-usecase --json`)
 *   → 404 { ok: false, error } when the id doesn't resolve
 */
export async function handleUseCases(
  projectRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!isGet(req)) {
    methodNotAllowed(res);
    return;
  }
  const url = new URL(req.url ?? "/", "http://localhost");
  const id = url.searchParams.get("id");
  const actorFilter = url.searchParams.get("actor");
  const { docs } = await discoverUseCaseDocs(projectRoot);

  if (id !== null) {
    const found = docs.find((d) => d.doc.id === id);
    if (found === undefined) {
      jsonResponse(res, 404, {
        ok: false,
        error: `use case "${id}" not found`,
      });
      return;
    }
    jsonResponse(res, 200, {
      ok: true,
      file: found.relPath,
      useCase: found.doc,
    });
    return;
  }

  const filtered = actorFilter
    ? docs.filter(
        (d) =>
          d.doc.primaryActor === actorFilter ||
          (d.doc.secondaryActors?.includes(actorFilter) ?? false),
      )
    : docs;

  jsonResponse(res, 200, {
    ok: true,
    count: filtered.length,
    useCases: filtered.map((d) => ({
      relPath: d.relPath,
      id: d.doc.id,
      name: d.doc.name,
      status: d.doc.status,
      primaryActor: d.doc.primaryActor,
      secondaryActors: d.doc.secondaryActors,
      slices: d.doc.slices.map((s) => ({
        id: s.id,
        status: s.status,
        flows: s.flows,
        tests: s.tests,
        realization: s.realization,
      })),
    })),
  });
}

/**
 * GET /__archik/actors
 *   → { ok, count, actors: [{ actor, file }, ...] }
 *   (mirrors `archik q actors --json`)
 */
export async function handleActors(
  projectRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!isGet(req)) {
    methodNotAllowed(res);
    return;
  }
  const { docs } = await discoverActorDocs(projectRoot);
  const flat = docs.flatMap((d) =>
    d.doc.actors.map((a) => ({ actor: a, file: d.relPath })),
  );
  jsonResponse(res, 200, {
    ok: true,
    count: flat.length,
    actors: flat,
  });
}

/**
 * GET /__archik/alphas
 *   → { ok, file, alphas: [...] }        (mirrors `archik alpha show --json`)
 *
 * Each alpha row carries the claimed state, the ladder index, the current
 * verification result (verified | over-claimed | subjective | missing), and
 * the user-authored note + evidence (if any). Identical to the CLI output —
 * the canvas can render it directly without re-running checks client-side.
 */
export async function handleAlphas(
  projectRoot: string,
  rootDocPath: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!isGet(req)) {
    methodNotAllowed(res);
    return;
  }
  const archDiscovery = await discoverDocs(rootDocPath, projectRoot);
  const ucDiscovery = await discoverUseCaseDocs(projectRoot);
  const seqDiscovery = await discoverSeqDocs(projectRoot);
  const actorDiscovery = await discoverActorDocs(projectRoot);
  const alphaResult = await discoverAlphaDoc(projectRoot);

  const fileExists = (rel: string): boolean =>
    existsSync(path.resolve(projectRoot, rel));
  const ctx = {
    archDocs: archDiscovery.docs,
    ucDocs: ucDiscovery.docs,
    seqDocs: seqDiscovery.docs,
    actorDocs: actorDiscovery.docs,
    fileExists,
  };

  const alphas = (ALPHA_NAMES as ReadonlyArray<AlphaName>).map((alpha) => {
    const entry = alphaResult.doc?.doc.alphas[alpha];
    const ladderLength = STATE_LADDERS[alpha].length;
    if (entry === undefined) {
      return {
        alpha,
        state: null,
        ladderIndex: -1,
        ladderLength,
        verification: "missing" as const,
      };
    }
    const result = evaluateAlphaState(alpha, entry.state, ctx);
    let verification: "verified" | "over-claimed" | "subjective";
    let reason: string | undefined;
    if (result === null) {
      verification = "subjective";
    } else if (result.ok) {
      verification = "verified";
    } else {
      verification = "over-claimed";
      reason = result.reason;
    }
    return {
      alpha,
      state: entry.state,
      ladderIndex: stateIndex(alpha, entry.state),
      ladderLength,
      verification,
      ...(reason ? { reason } : {}),
      ...(entry.note ? { note: entry.note } : {}),
      ...(entry.evidence ? { evidence: entry.evidence } : {}),
    };
  });

  jsonResponse(res, 200, {
    ok: true,
    file: alphaResult.doc?.relPath ?? null,
    alphas,
  });
}

/**
 * GET /__archik/trace
 *   → { ok, summary, rows }              (mirrors `archik trace --json`)
 *
 * Optional filters via query string:
 *   ?use-case=<id>    one use case only
 *   ?actor=<id>       use cases involving this actor
 *   ?status=<s>       slice status (active|proposed|deprecated)
 *   ?coverage=<l>     full|partial|none
 *
 * Summary is recomputed against the filtered rows so the totals describe
 * what the caller asked for, not the unfiltered universe.
 */
export async function handleTrace(
  projectRoot: string,
  rootDocPath: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!isGet(req)) {
    methodNotAllowed(res);
    return;
  }
  const url = new URL(req.url ?? "/", "http://localhost");
  const archDiscovery = await discoverDocs(rootDocPath, projectRoot);
  const ucDiscovery = await discoverUseCaseDocs(projectRoot);
  const seqDiscovery = await discoverSeqDocs(projectRoot);
  const matrix = buildTraceMatrix(
    ucDiscovery.docs,
    seqDiscovery.docs,
    archDiscovery.docs,
  );

  let rows = matrix.rows;
  const useCaseFilter = url.searchParams.get("use-case");
  if (useCaseFilter !== null) {
    rows = rows.filter((r) => r.useCase === useCaseFilter);
  }
  const actorFilter = url.searchParams.get("actor");
  if (actorFilter !== null) {
    rows = rows.filter(
      (r) =>
        r.primaryActor === actorFilter ||
        r.secondaryActors.includes(actorFilter),
    );
  }
  const statusFilter = url.searchParams.get("status");
  if (statusFilter !== null) {
    if (
      statusFilter !== "active" &&
      statusFilter !== "proposed" &&
      statusFilter !== "deprecated"
    ) {
      jsonResponse(res, 400, {
        ok: false,
        error: "status must be active | proposed | deprecated",
      });
      return;
    }
    rows = rows.filter((r) => r.status === statusFilter);
  }
  const coverageFilter = url.searchParams.get("coverage");
  if (coverageFilter !== null) {
    if (
      coverageFilter !== "full" &&
      coverageFilter !== "partial" &&
      coverageFilter !== "none"
    ) {
      jsonResponse(res, 400, {
        ok: false,
        error: "coverage must be full | partial | none",
      });
      return;
    }
    rows = rows.filter((r) => r.level === coverageFilter);
  }

  const summary = {
    useCases: new Set(rows.map((r) => r.useCase)).size,
    slices: rows.length,
    fullyTraced: rows.filter((r) => r.level === "full").length,
    partial: rows.filter((r) => r.level === "partial").length,
    untraced: rows.filter((r) => r.level === "none").length,
  };

  jsonResponse(res, 200, { ok: true, summary, rows });
}
