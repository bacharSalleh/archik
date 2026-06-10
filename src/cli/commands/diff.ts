import { existsSync } from "node:fs";
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
import type { Document } from "../../domain/types.ts";
import { discoverDocs } from "../../io/discovery.ts";
import { parseYaml } from "../../io/yaml.ts";
import { layout } from "../../layout/index.ts";
import { DiffSvg } from "../../render/DiffSvg.tsx";
import {
  gitToplevel,
  isGitRef,
  listFilesAtRef,
  readFileAtRef,
} from "../git.ts";
import { getString, type ParsedOptions } from "../options.ts";
import {
  LEGACY_DEFAULT_REL,
  NEW_DEFAULT_REL,
  projectRoot,
  resolveDocPath,
} from "../resolveDocPath.ts";
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
  let afterPath = opts._[1];
  const json = isJson(opts);
  if (beforePath === undefined) {
    if (json) {
      console.log(JSON.stringify({ ok: false, error: "usage: archik diff <before> [after] [--out diff.svg] [--json] — each side is a YAML file or a git ref; with one argument, compares <ref> against the working tree" }));
    } else {
      console.error("✗ Usage: archik diff <before> [after] [--out diff.svg]");
      console.error("  Each side is a YAML file or a git ref. With one argument,");
      console.error("  compares the document at <ref> against the working tree:");
      console.error("    archik diff main");
      console.error("    archik diff v1.2.0 v1.4.0");
    }
    return 1;
  }
  // One-argument form: `archik diff main` — the before side is a git
  // ref, the after side is the working-tree document.
  if (afterPath === undefined) {
    try {
      afterPath = await resolveDocPath(undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (json) console.log(JSON.stringify({ ok: false, error: message }));
      else console.error(`✗ ${message}`);
      return 1;
    }
  }
  const themeRaw = getString(opts, "theme") ?? "dark";
  if (themeRaw !== "dark" && themeRaw !== "light") {
    console.error(`✗ --theme must be "dark" or "light" (got "${themeRaw}")`);
    return 1;
  }
  const theme: ThemeName = themeRaw;

  const before = await readDocumentAuto(beforePath);
  if ("error" in before) {
    if (json) console.log(JSON.stringify({ ok: false, file: beforePath, error: before.error }));
    else console.error(`✗ ${beforePath}: ${before.error}`);
    return 1;
  }
  const after = await readDocumentAuto(afterPath);
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

/**
 * Each side of the diff is either a YAML file on disk or a git ref.
 * Disambiguation: an existing path always wins (a branch named like a
 * file you actually have is the rarer case, and the file is what you
 * can see); otherwise the spec must resolve to a commit.
 */
async function readDocumentAuto(
  spec: string,
): Promise<{ doc: Document } | { error: string }> {
  if (existsSync(path.resolve(spec))) return readDocument(spec);
  const cwd = process.cwd();
  if (!isGitRef(spec, cwd)) {
    return {
      error: `"${spec}" is neither a file on disk nor a git ref that resolves to a commit`,
    };
  }
  return readDocumentAtRef(spec, cwd);
}

/**
 * Load the merged architecture (root doc + every sub-file under
 * `.archik/`) from the git tree at `ref`, without touching the
 * working tree. The project layout at the ref is located the same
 * way `resolveDocPath` does on disk: `.archik/main.archik.yaml`
 * preferred, legacy root file still honoured, both present = error.
 */
async function readDocumentAtRef(
  ref: string,
  cwd: string,
): Promise<{ doc: Document } | { error: string }> {
  const top = gitToplevel(cwd);
  if (!top.ok) return { error: top.error };
  const toplevel = top.out;

  // Project root in the working tree → the same prefix inside the repo.
  let prefix: string;
  try {
    const docAbs = await resolveDocPath(undefined, cwd);
    const rel = path.relative(toplevel, projectRoot(docAbs));
    prefix = rel === "" ? "" : rel.split(path.sep).join("/") + "/";
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  const listed = listFilesAtRef(ref, cwd);
  if (!listed.ok) return { error: listed.error };
  const files = new Set(
    listed.out.split("\n").map((l) => l.trim()).filter((l) => l.length > 0),
  );

  const newRoot = `${prefix}${NEW_DEFAULT_REL}`;
  const legacyRoot = `${prefix}${LEGACY_DEFAULT_REL}`;
  const hasNew = files.has(newRoot);
  const hasLegacy = files.has(legacyRoot);
  if (hasNew && hasLegacy) {
    return {
      error: `at ${ref}: found both ${LEGACY_DEFAULT_REL} and ${NEW_DEFAULT_REL} — ambiguous layout`,
    };
  }
  if (!hasNew && !hasLegacy) {
    return { error: `at ${ref}: no archik document (looked for ${newRoot} and ${legacyRoot})` };
  }
  const rootRel = hasNew ? newRoot : legacyRoot;

  // Same membership rule discoverDocs uses: every *.archik.yaml under
  // `.archik/`, sidecars excluded.
  const subRels = [...files].filter(
    (f) =>
      f !== rootRel &&
      f.startsWith(`${prefix}.archik/`) &&
      f.endsWith(".archik.yaml") &&
      !f.endsWith(".archik.suggested.yaml"),
  );

  const rootText = readFileAtRef(ref, rootRel, cwd);
  if (!rootText.ok) return { error: rootText.error };
  let rootDoc: Document;
  try {
    rootDoc = parseYaml(rootText.out);
  } catch (err) {
    return {
      error: `at ${ref}: ${rootRel}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const nodes = [...rootDoc.nodes];
  const edges = [...rootDoc.edges];
  for (const rel of subRels) {
    const text = readFileAtRef(ref, rel, cwd);
    if (!text.ok) continue;
    try {
      const doc = parseYaml(text.out);
      nodes.push(...doc.nodes);
      edges.push(...doc.edges);
    } catch {
      // Mirror readDocument: a broken sub-file doesn't abort the diff.
    }
  }
  return { doc: { version: "1.0", name: "merged", nodes, edges } };
}

async function readDocument(
  file: string,
): Promise<{ doc: Document } | { error: string }> {
  const abs = path.resolve(file);
  let text: string;
  try {
    text = await readFile(abs, "utf-8");
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  try {
    parseYaml(text); // validate root first for a clear error message
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  // Walk sub-architecture files so the diff reflects the full diagram
  // state, not just the root file.
  const base = projectRoot(abs);
  const discovery = await discoverDocs(abs, base);
  const merged: Document = {
    version: "1.0",
    name: "merged",
    nodes: discovery.docs.flatMap((d) => d.doc.nodes),
    edges: discovery.docs.flatMap((d) => d.doc.edges),
  };
  return { doc: merged };
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
