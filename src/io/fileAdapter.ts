import type { Document } from "../domain/types.ts";
import { parseYaml, stringifyYaml } from "./yaml.ts";
import { parseJson, stringifyJson } from "./json.ts";

export type DocumentFormat = "yaml" | "json";

export function detectFormat(pathOrUrl: string): DocumentFormat {
  const withoutQueryOrHash = pathOrUrl.split(/[?#]/, 1)[0] ?? pathOrUrl;
  const lower = withoutQueryOrHash.toLowerCase();
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".json")) return "json";
  throw new Error(
    `Unknown document format for "${pathOrUrl}" (expected .yaml/.yml/.json)`,
  );
}

export function parseDocument(text: string, format: DocumentFormat): Document {
  return format === "yaml" ? parseYaml(text) : parseJson(text);
}

export function serializeDocument(
  doc: Document,
  format: DocumentFormat,
): string {
  return format === "yaml" ? stringifyYaml(doc) : stringifyJson(doc);
}

export async function loadDocumentFromUrl(url: string): Promise<Document> {
  const format = detectFormat(url);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${res.status} ${res.statusText}`,
    );
  }
  const text = await res.text();
  try {
    return parseDocument(text, format);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not load ${url}:\n${msg}`);
  }
}

const MIME: Record<DocumentFormat, string> = {
  yaml: "application/yaml",
  json: "application/json",
};

export function saveDocumentAsDownload(
  filename: string,
  doc: Document,
): void {
  const format = detectFormat(filename);
  const text = serializeDocument(doc, format);
  const blob = new Blob([text], { type: MIME[format] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
