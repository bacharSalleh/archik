import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  diffDocuments,
  mergeForDiff,
  statusMap,
  type DocumentDiff,
} from "../../domain/diff.ts";
import { parseYaml } from "../../io/yaml.ts";
import { layout } from "../../layout/index.ts";
import { DiffSvg } from "../../render/DiffSvg.tsx";
import { getString, type ParsedOptions } from "../options.ts";
import {
  injectBackground,
  inlineThemeVars,
  type ThemeName,
} from "../themeTokens.ts";

const isJson = (opts: ParsedOptions): boolean => {
  const v = getString(opts, "json");
  return v !== undefined && v !== "false" && v !== "0";
};

export async function diffCommand(opts: ParsedOptions): Promise<number> {
  const beforePath = opts._[0];
  const afterPath = opts._[1];
  const json = isJson(opts);
  if (beforePath === undefined || afterPath === undefined) {
    if (json) {
      console.log(JSON.stringify({ ok: false, error: "usage: archik diff <before.yaml> <after.yaml> [--out diff.svg] [--json]" }));
    } else {
      console.error("✗ Usage: archik diff <before.yaml> <after.yaml> [--out diff.svg]");
    }
    return 1;
  }
  const themeRaw = getString(opts, "theme") ?? "dark";
  if (themeRaw !== "dark" && themeRaw !== "light") {
    console.error(`✗ --theme must be "dark" or "light" (got "${themeRaw}")`);
    return 1;
  }
  const theme: ThemeName = themeRaw;

  const before = await readDocument(beforePath);
  if ("error" in before) {
    if (json) console.log(JSON.stringify({ ok: false, file: beforePath, error: before.error }));
    else console.error(`✗ ${beforePath}: ${before.error}`);
    return 1;
  }
  const after = await readDocument(afterPath);
  if ("error" in after) {
    if (json) console.log(JSON.stringify({ ok: false, file: afterPath, error: after.error }));
    else console.error(`✗ ${afterPath}: ${after.error}`);
    return 1;
  }

  const diff = diffDocuments(before.doc, after.doc);

  if (json) {
    const totals = {
      added: diff.nodes.added.length + diff.edges.added.length,
      removed: diff.nodes.removed.length + diff.edges.removed.length,
      changed: diff.nodes.changed.length + diff.edges.changed.length,
    };
    console.log(
      JSON.stringify(
        {
          ok: true,
          before: beforePath,
          after: afterPath,
          totals,
          nodes: diff.nodes,
          edges: diff.edges,
        },
        null,
        2,
      ),
    );
  } else {
    printSummary(beforePath, afterPath, diff);
  }

  const out = getString(opts, "out");
  if (out !== undefined) {
    const merged = mergeForDiff(before.doc, after.doc);
    const positioned = await layout(merged);
    const inner = renderToStaticMarkup(
      createElement(DiffSvg, { positioned, statuses: statusMap(diff) }),
    );
    const themed = injectBackground(inlineThemeVars(inner, theme), theme);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n${themed}\n`;
    const outAbs = path.resolve(out);
    await mkdir(path.dirname(outAbs), { recursive: true });
    await writeFile(outAbs, svg, "utf-8");
    if (!json) console.log(`\n✓ Visual diff → ${out}`);
  }

  return 0;
}

async function readDocument(
  file: string,
): Promise<{ doc: import("../../domain/types.ts").Document } | { error: string }> {
  const abs = path.resolve(file);
  let text: string;
  try {
    text = await readFile(abs, "utf-8");
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  try {
    return { doc: parseYaml(text) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function printSummary(
  beforePath: string,
  afterPath: string,
  diff: DocumentDiff,
): void {
  const totalChanged =
    diff.nodes.added.length +
    diff.nodes.removed.length +
    diff.nodes.changed.length +
    diff.edges.added.length +
    diff.edges.removed.length +
    diff.edges.changed.length;

  console.log(`Diff: ${beforePath} → ${afterPath}`);
  console.log("");

  if (totalChanged === 0) {
    console.log("  No changes.");
    return;
  }

  if (
    diff.nodes.added.length > 0 ||
    diff.edges.added.length > 0
  ) {
    const total = diff.nodes.added.length + diff.edges.added.length;
    console.log(`  Added (${total}):`);
    for (const n of diff.nodes.added) {
      console.log(`    + node  ${n.id}  (${n.kind})${n.name ? `  "${n.name}"` : ""}`);
    }
    for (const e of diff.edges.added) {
      console.log(
        `    + edge  ${e.from} → ${e.to}  (${e.relationship})${e.label ? `  "${e.label}"` : ""}`,
      );
    }
    console.log("");
  }

  if (diff.nodes.removed.length > 0 || diff.edges.removed.length > 0) {
    const total = diff.nodes.removed.length + diff.edges.removed.length;
    console.log(`  Removed (${total}):`);
    for (const n of diff.nodes.removed) {
      console.log(`    − node  ${n.id}  (${n.kind})${n.name ? `  "${n.name}"` : ""}`);
    }
    for (const e of diff.edges.removed) {
      console.log(
        `    − edge  ${e.from} → ${e.to}  (${e.relationship})${e.label ? `  "${e.label}"` : ""}`,
      );
    }
    console.log("");
  }

  if (diff.nodes.changed.length > 0 || diff.edges.changed.length > 0) {
    const total = diff.nodes.changed.length + diff.edges.changed.length;
    console.log(`  Changed (${total}):`);
    for (const c of diff.nodes.changed) {
      console.log(`    ~ node  ${c.node.id}`);
      for (const change of c.changes) {
        console.log(`        ${change.field}: ${formatValue(change.before)} → ${formatValue(change.after)}`);
      }
    }
    for (const c of diff.edges.changed) {
      console.log(`    ~ edge  ${c.edge.id}`);
      for (const change of c.changes) {
        console.log(`        ${change.field}: ${formatValue(change.before)} → ${formatValue(change.after)}`);
      }
    }
    console.log("");
  }

  console.log(
    `Summary: ${diff.nodes.added.length + diff.edges.added.length} added, ` +
      `${diff.nodes.removed.length + diff.edges.removed.length} removed, ` +
      `${diff.nodes.changed.length + diff.edges.changed.length} changed`,
  );
}

function formatValue(value: unknown): string {
  if (value === undefined) return "(unset)";
  if (typeof value === "string") return JSON.stringify(value);
  return JSON.stringify(value);
}
