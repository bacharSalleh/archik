import type { Document } from "../domain/types.ts";
import { stringifyJson } from "./json.ts";
import { stringifyYaml } from "./yaml.ts";
import { exportMarkdown } from "./markdown.ts";

export interface Exporter {
  readonly name: string;
  readonly label: string;
  readonly extension: string;
  readonly mime: string;
  export(doc: Document): string;
}

export const yamlExporter: Exporter = {
  name: "yaml",
  label: "YAML",
  extension: ".yaml",
  mime: "application/yaml",
  export: stringifyYaml,
};

export const jsonExporter: Exporter = {
  name: "json",
  label: "JSON",
  extension: ".json",
  mime: "application/json",
  export: stringifyJson,
};

export const markdownExporter: Exporter = {
  name: "markdown",
  label: "Markdown",
  extension: ".md",
  mime: "text/markdown",
  export: exportMarkdown,
};

export const exporters: readonly Exporter[] = [
  yamlExporter,
  jsonExporter,
  markdownExporter,
];

export function getExporter(name: string): Exporter {
  const found = exporters.find((e) => e.name === name);
  if (!found) {
    throw new Error(`Unknown exporter: ${name}`);
  }
  return found;
}
