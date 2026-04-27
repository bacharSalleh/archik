import type { Document } from "../domain/types.ts";
import { parseYaml, stringifyYaml } from "./yaml.ts";
import { parseJson, stringifyJson } from "./json.ts";

export type DocumentFormat = "yaml" | "json";

export function detectFormat(pathOrUrl: string): DocumentFormat {
  // Try the path itself first — covers normal URLs like
  // /architecture.archik.yaml and absolute file paths.
  const withoutQueryOrHash = pathOrUrl.split(/[?#]/, 1)[0] ?? pathOrUrl;
  const fromPath = matchExtension(withoutQueryOrHash);
  if (fromPath !== null) return fromPath;
  // Fallback: the per-file dev-server endpoint puts the actual
  // filename in `?path=…` (e.g. `/__archik/file?path=.archik/foo.yaml`).
  // Without this branch every sub-file load throws "Unknown document
  // format" because the path itself is just `/__archik/file`.
  const queryStart = pathOrUrl.indexOf("?");
  if (queryStart >= 0) {
    const params = new URLSearchParams(pathOrUrl.slice(queryStart + 1));
    const filePath = params.get("path");
    if (filePath !== null && filePath !== "") {
      const fromQuery = matchExtension(filePath);
      if (fromQuery !== null) return fromQuery;
    }
  }
  throw new Error(
    `Unknown document format for "${pathOrUrl}" (expected .yaml/.yml/.json)`,
  );
}

function matchExtension(p: string): DocumentFormat | null {
  const lower = p.toLowerCase();
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".json")) return "json";
  return null;
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
  return (await loadDocumentFromUrlWithText(url)).document;
}

export async function loadDocumentFromUrlWithText(
  url: string,
): Promise<{ document: Document; text: string }> {
  const format = detectFormat(url);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${res.status} ${res.statusText}`,
    );
  }
  const text = await res.text();
  try {
    return { document: parseDocument(text, format), text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not load ${url}:\n${msg}`);
  }
}

export async function saveDocumentToUrl(
  url: string,
  doc: Document,
): Promise<{ text: string }> {
  const format = detectFormat(url);
  const text = serializeDocument(doc, format);
  const mime = format === "yaml" ? MIME.yaml : MIME.json;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": mime },
    body: text,
  });
  if (!res.ok) {
    throw new Error(
      `Failed to save ${url}: ${res.status} ${res.statusText}`,
    );
  }
  return { text };
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
