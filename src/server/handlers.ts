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
import { promises as fs } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { diffDocuments, mergeForDiff, statusMap } from "../domain/diff.ts";
import { stripSuggestionMarker, suggestionPath } from "../domain/suggestion.ts";
import { parseYaml, stringifyYaml } from "../io/yaml.ts";
import { layout } from "../layout/index.ts";
import { DiffSvg } from "../render/DiffSvg.tsx";

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
      res.end("Forbidden: PUT must come from a same-origin loopback page.");
      return;
    }
    try {
      const body = await readBody(req);
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
    return handleSidecar(abs, req, res);
  }
  return handleYaml(abs, req, res);
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
