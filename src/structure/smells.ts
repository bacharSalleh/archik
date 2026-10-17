/**
 * Structural smells backed by code evidence. No model needed — this
 * reads the source tree directly, so it works on any TS/JS codebase,
 * with or without an archik diagram.
 *
 *   FOLDER LOOP   two or more sibling folders import each other
 *                 (directly or through a chain). Each edge in the
 *                 loop carries a real `file → specifier` example.
 *   OVERSIZED FILE  a source file longer than `maxFileLines`.
 *
 * Folder edges are measured between SIBLINGS: for an import from file
 * F to file G, take their deepest common folder L; the edge runs from
 * the child of L that holds F to the child of L that holds G. Files
 * that sit directly in L are skipped — a folder using its own children
 * (or a child using its parent) is nesting, not a loop. This catches
 * loops at every depth: `src/a ↔ src/b` and `src/a/x ↔ src/a/y`.
 *
 * Only relative specifiers are resolved (aliases and packages can't be
 * attributed to a folder without a resolver). That makes the result a
 * lower bound: every loop reported is real.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { extractSpecifiers } from "../drift/edge-drift.ts";

const SCANNABLE = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  "target",
]);
const MAX_DEPTH = 20;
/** Extensions tried, in order, when a specifier omits one. */
const RESOLVE_EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

export type SmellLimits = {
  maxFileLines: number;
};

export const DEFAULT_SMELL_LIMITS: SmellLimits = {
  maxFileLines: 500,
};

export type ImportExample = { file: string; specifier: string };

export type FolderEdge = {
  from: string;
  to: string;
  /** How many imports back this edge (all files). */
  imports: number;
  /** Up to 3 concrete imports, for evidence. */
  examples: ImportExample[];
};

export type FolderLoop = {
  type: "folder-loop";
  /** The shared parent folder ("" = scan root). */
  parent: string;
  /** Sibling folders in the loop, sorted. */
  folders: string[];
  /** Every folder edge inside the loop. */
  edges: FolderEdge[];
  /** Folder pairs that import each other directly (A → B and B → A). */
  directPairs: Array<[string, string]>;
  /** Up to 3 edges with the fewest imports — the cheapest to cut. */
  cheapestCuts: FolderEdge[];
};

export type OversizedFile = {
  type: "oversized-file";
  file: string;
  lines: number;
  limit: number;
};

export type SmellReport = {
  root: string;
  filesScanned: number;
  folderLoops: FolderLoop[];
  oversizedFiles: OversizedFile[];
  summary: { folderLoops: number; oversizedFiles: number; total: number };
};

type SourceFile = { rel: string; text: string };

async function collect(
  absDir: string,
  root: string,
  depth: number,
  out: string[],
): Promise<void> {
  if (depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      await collect(full, root, depth + 1, out);
    } else if (
      entry.isFile() &&
      SCANNABLE.has(path.extname(entry.name)) &&
      !entry.name.endsWith(".d.ts")
    ) {
      out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
}

function normalizeRel(p: string): string | null {
  const segments: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (segments.length === 0) return null; // escaped the scan root
      segments.pop();
      continue;
    }
    segments.push(seg);
  }
  return segments.join("/");
}

/** Map a specifier to a scanned file, or null when it isn't one. */
export function resolveImport(
  fromFile: string,
  specifier: string,
  files: ReadonlySet<string>,
): string | null {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  const base = normalizeRel(path.posix.join(path.posix.dirname(fromFile), specifier));
  if (base === null || base === "") return null;
  if (files.has(base)) return base;
  // `./x.js` written for a `./x.ts` source (TS ESM convention).
  const ext = path.posix.extname(base);
  const stem = ext.length > 0 ? base.slice(0, -ext.length) : base;
  for (const e of RESOLVE_EXTS) {
    if (files.has(stem + e)) return stem + e;
    if (files.has(base + e)) return base + e;
  }
  for (const e of RESOLVE_EXTS) {
    if (files.has(`${base}/index${e}`)) return `${base}/index${e}`;
  }
  return null;
}

/** The sibling-folder pair an import crosses, or null. */
export function siblingPair(
  fromFile: string,
  toFile: string,
): { parent: string; from: string; to: string } | null {
  const a = fromFile.split("/").slice(0, -1);
  const b = toFile.split("/").slice(0, -1);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  // One side sits directly in the common folder → nesting, not a loop.
  if (i >= a.length || i >= b.length) return null;
  const parent = a.slice(0, i).join("/");
  const prefix = parent === "" ? "" : parent + "/";
  return { parent, from: prefix + a[i], to: prefix + b[i] };
}

/** Tarjan's strongly connected components; returns components > 1. */
function cycles(nodes: string[], adj: Map<string, Set<string>>): string[][] {
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];
  const visit = (v: string): void => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!));
      }
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) out.push(comp.sort());
    }
  };
  for (const n of nodes) if (!idx.has(n)) visit(n);
  return out;
}

/** Pure analysis over already-read files. Exported for tests. */
export function analyzeSources(
  sources: SourceFile[],
  limits: SmellLimits = DEFAULT_SMELL_LIMITS,
): Omit<SmellReport, "root"> {
  const files = new Set(sources.map((s) => s.rel));
  const edges = new Map<string, FolderEdge & { parent: string }>();

  for (const { rel, text } of sources) {
    for (const spec of extractSpecifiers(text)) {
      const target = resolveImport(rel, spec, files);
      if (target === null) continue;
      const pair = siblingPair(rel, target);
      if (pair === null) continue;
      const key = `${pair.from}\n${pair.to}`;
      const edge = edges.get(key) ?? {
        parent: pair.parent,
        from: pair.from,
        to: pair.to,
        imports: 0,
        examples: [],
      };
      edge.imports++;
      if (edge.examples.length < 3) edge.examples.push({ file: rel, specifier: spec });
      edges.set(key, edge);
    }
  }

  const adj = new Map<string, Set<string>>();
  for (const e of edges.values()) {
    const set = adj.get(e.from) ?? new Set<string>();
    set.add(e.to);
    adj.set(e.from, set);
  }
  const folders = [...new Set([...edges.values()].flatMap((e) => [e.from, e.to]))].sort();

  const folderLoops: FolderLoop[] = cycles(folders, adj).map((comp) => {
    const members = new Set(comp);
    const loopEdges = [...edges.values()]
      .filter((e) => members.has(e.from) && members.has(e.to))
      .map(({ from, to, imports, examples }) => ({ from, to, imports, examples }))
      .sort((x, y) => x.from.localeCompare(y.from) || x.to.localeCompare(y.to));
    const parent = edges.get(`${loopEdges[0]!.from}\n${loopEdges[0]!.to}`)!.parent;
    const directPairs: Array<[string, string]> = loopEdges
      .filter((e) => e.from < e.to && edges.has(`${e.to}\n${e.from}`))
      .map((e) => [e.from, e.to]);
    const cheapestCuts = [...loopEdges]
      .sort((x, y) => x.imports - y.imports || x.from.localeCompare(y.from))
      .slice(0, 3);
    return {
      type: "folder-loop",
      parent,
      folders: comp,
      edges: loopEdges,
      directPairs,
      cheapestCuts,
    };
  });
  // Biggest loops first; ties by location.
  folderLoops.sort(
    (x, y) => y.folders.length - x.folders.length || x.folders[0]!.localeCompare(y.folders[0]!),
  );

  const oversizedFiles: OversizedFile[] = sources
    .map(({ rel, text }) => ({ rel, lines: countLines(text) }))
    .filter(({ lines }) => lines > limits.maxFileLines)
    .map(({ rel, lines }) => ({
      type: "oversized-file" as const,
      file: rel,
      lines,
      limit: limits.maxFileLines,
    }))
    .sort((x, y) => y.lines - x.lines || x.file.localeCompare(y.file));

  return {
    filesScanned: sources.length,
    folderLoops,
    oversizedFiles,
    summary: {
      folderLoops: folderLoops.length,
      oversizedFiles: oversizedFiles.length,
      total: folderLoops.length + oversizedFiles.length,
    },
  };
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  const n = text.split("\n").length;
  return text.endsWith("\n") ? n - 1 : n;
}

/** Scan `root` on disk and analyse it. */
export async function scanSmells(
  root: string,
  limits: SmellLimits = DEFAULT_SMELL_LIMITS,
): Promise<SmellReport> {
  const rels: string[] = [];
  await collect(root, root, 0, rels);
  rels.sort();
  const sources: SourceFile[] = [];
  for (const rel of rels) {
    try {
      sources.push({ rel, text: await readFile(path.join(root, rel), "utf-8") });
    } catch {
      // unreadable file — skip
    }
  }
  return { root, ...analyzeSources(sources, limits) };
}
