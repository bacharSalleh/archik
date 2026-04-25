import YAML from "yaml";
import type { Document } from "../domain/types.ts";
import { formatErrors, validateDocument } from "../domain/validate.ts";

export function parseYaml(text: string): Document {
  let raw: unknown;
  try {
    raw = YAML.parse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid YAML: ${msg}`);
  }
  const result = validateDocument(raw);
  if (!result.ok) {
    throw new Error(
      `Invalid Archik document:\n${formatErrors(result.errors)}`,
    );
  }
  return result.value;
}

export function stringifyYaml(doc: Document): string {
  return YAML.stringify(doc, {
    indent: 2,
    lineWidth: 0,
  });
}
