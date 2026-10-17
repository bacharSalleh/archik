/**
 * Loads everything `buildGap` needs from disk: the merged model, the
 * TS/JS import graph, and each node's sourcePath in the last commit
 * (so a moved node can say where its code still lives).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { buildGap, type GapTask } from "../domain/gap.ts";
import { buildImportGraph } from "../drift/edge-drift.ts";
import { spawnSync } from "node:child_process";
import { discoverDocs, type LoadedDoc } from "./discovery.ts";

/** sourcePaths and edge pairs in HEAD's version of the model files. */
export function previousModel(
  root: string,
  docs: LoadedDoc[],
): { sourcePaths: Map<string, string>; edges: Set<string> } {
  const out = new Map<string, string>();
  const edges = new Set<string>();
  for (const d of docs) {
    const shown = spawnSync("git", ["show", `HEAD:./${d.relPath}`], { cwd: root, encoding: "utf-8" });
    if (shown.status !== 0 || typeof shown.stdout !== "string") continue;
    let raw: unknown;
    try {
      raw = YAML.parse(shown.stdout);
    } catch {
      continue;
    }
    const nodes = (raw as { nodes?: unknown } | null)?.nodes;
    if (!Array.isArray(nodes)) continue;
    for (const n of nodes as Array<{ id?: unknown; sourcePath?: unknown }>) {
      if (typeof n?.id === "string" && typeof n.sourcePath === "string") out.set(n.id, n.sourcePath);
    }
    const rawEdges = (raw as { edges?: unknown }).edges;
    if (Array.isArray(rawEdges)) {
      for (const e of rawEdges as Array<{ from?: unknown; to?: unknown }>) {
        if (typeof e?.from === "string" && typeof e.to === "string") edges.add(`${e.from}\n${e.to}`);
      }
    }
  }
  return { sourcePaths: out, edges };
}

export async function computeGap(
  docPath: string,
  root: string,
): Promise<{ ok: true; tasks: GapTask[] } | { ok: false; error: string }> {
  const discovery = await discoverDocs(docPath, root);
  const rootError = discovery.errors.find((e) => e.abs === path.resolve(docPath));
  if (rootError !== undefined) return { ok: false, error: `${rootError.relPath}: ${rootError.message}` };
  const nodes = discovery.docs.flatMap((d) => d.doc.nodes);
  const graph = await buildImportGraph(nodes, root);
  const previous = previousModel(root, discovery.docs);
  const tasks = buildGap({
    docs: discovery.docs,
    exists: (rel) => existsSync(path.resolve(root, rel)),
    graph,
    previousSourcePaths: previous.sourcePaths,
    previousEdges: previous.edges,
  });
  return { ok: true, tasks };
}
