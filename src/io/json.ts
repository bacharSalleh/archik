import type { Document } from "../domain/types.ts";
import { formatErrors, validateDocument } from "../domain/validate.ts";

export function parseJson(text: string): Document {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON: ${msg}`);
  }
  const result = validateDocument(raw);
  if (!result.ok) {
    throw new Error(
      `Invalid Archik document:\n${formatErrors(result.errors)}`,
    );
  }
  return result.value;
}

export function stringifyJson(doc: Document): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
