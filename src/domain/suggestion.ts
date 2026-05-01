import path from "node:path";
import type { Document } from "./types.ts";

/**
 * Conventions for the Suggest Arch feature.
 *
 * A "suggestion" is a sidecar YAML file living next to the main
 * architecture file. Claude (or any other tool) writes the proposed
 * end state into the sidecar; the user reviews via the canvas or
 * `archik suggest show` and applies via `archik suggest accept`.
 *
 * Sidecar naming: insert `.suggested` before the file's extension.
 *
 *   architecture.archik.yaml      → architecture.archik.suggested.yaml
 *   foo.archik.json               → foo.archik.suggested.json
 *   plain.yaml                    → plain.suggested.yaml
 */
export function suggestionPath(mainPath: string): string {
  const dir = path.dirname(mainPath);
  const base = path.basename(mainPath);
  const ext = path.extname(base);
  const stem = ext.length > 0 ? base.slice(0, -ext.length) : base;
  return path.join(dir, `${stem}.suggested${ext}`);
}

/**
 * Three modes an archik file can be in. Validation strictness varies:
 *
 *   - `normal`     — `*.archik.yaml`. The canonical architecture.
 *                    Code-bearing nodes MUST declare a `sourcePath`
 *                    and that path MUST exist on disk.
 *   - `suggested`  — `*.archik.suggested.yaml`. A pending change to
 *                    a normal file. Same rules as normal — it'll
 *                    become normal on accept.
 *   - `discussion` — `*.archik.discussion.yaml`. Greenfield /
 *                    exploratory drafts (e.g., a not-yet-built
 *                    project, an architectural option). `sourcePath`
 *                    is optional and may point at paths that don't
 *                    exist yet.
 *
 * Mode is determined purely by filename — no metadata flag to forget.
 */
export type ArchikFileMode = "normal" | "suggested" | "discussion";

export function archikFileMode(filePath: string): ArchikFileMode {
  const base = path.basename(filePath);
  if (base.endsWith(".archik.suggested.yaml")) return "suggested";
  if (base.endsWith(".archik.discussion.yaml")) return "discussion";
  return "normal";
}

/**
 * True when this document carries a `metadata.suggestion` block —
 * i.e. it identifies itself as a Claude-authored proposal rather
 * than the canonical architecture.
 */
export function isSuggestion(doc: Document): boolean {
  return doc.metadata?.suggestion !== undefined;
}

/**
 * Strip the suggestion marker so the document looks like a normal
 * architecture file. Used when accepting a suggestion — the sidecar
 * becomes the new main file, and the main file isn't a suggestion.
 */
export function stripSuggestionMarker(doc: Document): Document {
  if (doc.metadata?.suggestion === undefined) return doc;
  const { suggestion: _suggestion, ...rest } = doc.metadata;
  const cleaned = { ...doc };
  if (Object.keys(rest).length === 0) {
    delete cleaned.metadata;
  } else {
    cleaned.metadata = rest;
  }
  return cleaned;
}
