import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { discoverDocs } from "../../io/discovery.ts";
import { parseYaml } from "../../io/yaml.ts";
import { layout } from "../../layout/index.ts";
import type { Document } from "../../domain/types.ts";
import { DiagramSvg } from "../../render/DiagramSvg.tsx";
import { getString, type ParsedOptions } from "../options.ts";
import { projectRoot, resolveDocPath } from "../resolveDocPath.ts";
import {
  injectBackground,
  inlineThemeVars,
  type ThemeName,
} from "../themeTokens.ts";

export async function renderCommand(opts: ParsedOptions): Promise<number> {
  let inputAbs: string;
  try {
    inputAbs = await resolveDocPath(opts._[0]);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const file = path.relative(process.cwd(), inputAbs) || inputAbs;
  const out = getString(opts, "out") ?? "diagram.svg";
  const themeRaw = getString(opts, "theme") ?? "dark";
  if (themeRaw !== "dark" && themeRaw !== "light") {
    console.error(`✗ --theme must be "dark" or "light" (got "${themeRaw}")`);
    return 1;
  }
  const theme: ThemeName = themeRaw;

  // Validate the root file first for a clear parse error message.
  let text: string;
  try {
    text = await readFile(inputAbs, "utf-8");
  } catch (err) {
    console.error(`✗ Cannot read ${file}`);
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
  try {
    parseYaml(text);
  } catch (err) {
    console.error(`✗ ${file}`);
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  // Walk sub-architecture files and merge all nodes + edges so the
  // rendered SVG reflects the full diagram, not just the root file.
  const base = projectRoot(inputAbs);
  const discovery = await discoverDocs(inputAbs, base);
  for (const e of discovery.errors) {
    console.error(`warn: ${e.relPath}: ${e.message}`);
  }
  const merged: Document = {
    version: "1.0",
    name: "merged",
    nodes: discovery.docs.flatMap((d) => d.doc.nodes),
    edges: discovery.docs.flatMap((d) => d.doc.edges),
  };

  const positioned = await layout(merged);
  const inner = renderToStaticMarkup(
    createElement(DiagramSvg, { positioned }),
  );
  const themed = injectBackground(inlineThemeVars(inner, theme), theme);
  // Wrap in xml header for safety when opened standalone.
  const finalSvg = `<?xml version="1.0" encoding="UTF-8"?>\n${themed}\n`;
  const outAbs = path.resolve(out);
  // Ensure the parent directory exists so `archik render --out a/b/c.svg`
  // works for arbitrary nested paths.
  await mkdir(path.dirname(outAbs), { recursive: true });
  await writeFile(outAbs, finalSvg, "utf-8");
  console.log(
    `✓ Rendered ${merged.nodes.length} nodes / ${merged.edges.length} edges → ${out}`,
  );
  return 0;
}
