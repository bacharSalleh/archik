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
