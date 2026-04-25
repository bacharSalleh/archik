import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseYaml } from "../../io/yaml.ts";
import { layout } from "../../layout/index.ts";
import { DiagramSvg } from "../../render/DiagramSvg.tsx";
import { getString, type ParsedOptions } from "../options.ts";
import { inlineThemeVars, type ThemeName } from "../themeTokens.ts";

export async function renderCommand(opts: ParsedOptions): Promise<number> {
  const file = opts._[0] ?? "architecture.archik.yaml";
  const out = getString(opts, "out") ?? "diagram.svg";
  const themeRaw = getString(opts, "theme") ?? "dark";
  if (themeRaw !== "dark" && themeRaw !== "light") {
    console.error(`✗ --theme must be "dark" or "light" (got "${themeRaw}")`);
    return 1;
  }
  const theme: ThemeName = themeRaw;

  const inputAbs = path.resolve(file);
  let text: string;
  try {
    text = await readFile(inputAbs, "utf-8");
  } catch (err) {
    console.error(`✗ Cannot read ${file}`);
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  let doc;
  try {
    doc = parseYaml(text);
  } catch (err) {
    console.error(`✗ ${file}`);
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const positioned = await layout(doc);
  const inner = renderToStaticMarkup(
    createElement(DiagramSvg, { positioned }),
  );
  const themed = inlineThemeVars(inner, theme);
  // Wrap in xml header for safety when opened standalone.
  const finalSvg = `<?xml version="1.0" encoding="UTF-8"?>\n${themed}\n`;
  const outAbs = path.resolve(out);
  await writeFile(outAbs, finalSvg, "utf-8");
  console.log(
    `✓ Rendered ${doc.nodes.length} nodes / ${doc.edges.length} edges → ${out}`,
  );
  return 0;
}
