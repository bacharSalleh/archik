/**
 * The gap between the model and the code — the agent's work list.
 *
 * The architect steers by changing the model (move a box, draw or
 * delete an edge, pick a style). The code then has to catch up. This
 * module turns "model says X, code says Y" into concrete tasks:
 *
 *   move-code       a node's sourcePath changed; its old folder still
 *                   holds the code (old path from the last commit)
 *   create-code     a node's sourcePath does not exist yet
 *   finish          a proposed node's code now exists — flip it active
 *   remove-import   the architect removed an edge (vs the last commit)
 *                   but the code still imports across it
 *   undeclared-import  code imports across nodes the model never
 *                   connected — model debt, not steering work
 *   add-dependency  a structural edge has no matching import yet
 *   style-break     an import breaks the architecture style
 *
 * When the list is empty, the code matches the model.
 * Pure: the caller supplies file existence, the import graph and the
 * previous sourcePaths.
 */
import type { LoadedDoc } from "../io/discovery.ts";
import { checkEdgeDrift, type ImportEvidence, type ImportGraph } from "../drift/edge-drift.ts";
import { checkStyle } from "./style.ts";
import type { Document, Edge } from "./types.ts";

export type GapTask =
  | { type: "move-code"; node: string; from: string; to: string }
  | { type: "create-code"; node: string; path: string }
  | { type: "finish"; node: string; path: string }
  | { type: "remove-import"; from: string; to: string; evidence: ImportEvidence[] }
  | { type: "undeclared-import"; from: string; to: string; evidence: ImportEvidence[] }
  | { type: "add-dependency"; edgeId: string; from: string; to: string; relationship: string }
  | { type: "style-break"; from: string; to: string; message: string; evidence: ImportEvidence[] };

const ORDER: Record<GapTask["type"], number> = {
  "move-code": 0,
  "create-code": 1,
  "style-break": 2,
  "remove-import": 3,
  "add-dependency": 4,
  finish: 5,
  "undeclared-import": 6,
};

/** Steering work vs. model debt (imports nobody ever modelled). */
export const isSteeringTask = (t: GapTask): boolean => t.type !== "undeclared-import";

export function buildGap(input: {
  docs: LoadedDoc[];
  /** Does this project-relative path exist on disk? */
  exists: (rel: string) => boolean;
  graph: ImportGraph;
  /** sourcePath per node id in the last committed model (may be empty). */
  previousSourcePaths: ReadonlyMap<string, string>;
  /** "from\nto" pairs connected by an edge in the last commit. */
  previousEdges?: ReadonlySet<string>;
}): GapTask[] {
  const { docs, exists, graph, previousSourcePaths } = input;
  const previousEdges = input.previousEdges ?? new Set<string>();
  const nodes = docs.flatMap((d) => d.doc.nodes);
  const tasks: GapTask[] = [];

  for (const node of nodes) {
    const path = node.sourcePath?.replace(/\/+$/, "");
    if (path === undefined || node.status === "deprecated") continue;
    if (exists(path)) {
      if (node.status === "proposed") tasks.push({ type: "finish", node: node.id, path });
      continue;
    }
    const before = previousSourcePaths.get(node.id)?.replace(/\/+$/, "");
    if (before !== undefined && before !== path && exists(before)) {
      tasks.push({ type: "move-code", node: node.id, from: before, to: path });
    } else {
      tasks.push({ type: "create-code", node: node.id, path });
    }
  }

  // Imports measured against the architecture style: treat every
  // import as a dependency edge and run the same rule as the model.
  const importDocs: LoadedDoc[] = docs.map((d, i) => ({
    ...d,
    doc: {
      ...d.doc,
      edges:
        i === 0
          ? graph.pairs.map(
              (p): Edge => ({ id: `import:${p.from}->${p.to}`, from: p.from, to: p.to, relationship: "depends_on" }),
            )
          : [],
    },
  }));
  const styleBreaks = new Set<string>();
  for (const err of checkStyle(importDocs).errors) {
    const m = /^edges\.import:(.+)->(.+)$/.exec(err.path);
    if (m === null) continue;
    const [, from, to] = m as unknown as [string, string, string];
    styleBreaks.add(`${from}\n${to}`);
    const pair = graph.pairs.find((p) => p.from === from && p.to === to);
    tasks.push({ type: "style-break", from, to, message: err.message, evidence: pair?.evidence ?? [] });
  }

  const merged: Document = {
    version: "1.0",
    name: "merged",
    nodes,
    edges: docs.flatMap((d) => d.doc.edges),
  };
  const drift = checkEdgeDrift(merged, graph);
  // An edge between containers covers the imports of everything inside
  // them: `cli → domain` allows `cli-validate` to import `domain/x`.
  const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]));
  const chain = (id: string): string[] => {
    const out: string[] = [];
    let cur: string | undefined = id;
    while (cur !== undefined && out.length <= nodes.length) {
      out.push(cur);
      cur = parentOf.get(cur);
    }
    return out;
  };
  const linked = new Set(merged.edges.flatMap((e) => [`${e.from}\n${e.to}`, `${e.to}\n${e.from}`]));
  const covered = (from: string, to: string): boolean =>
    chain(from).some((a) => chain(to).some((b) => linked.has(`${a}\n${b}`)));
  const wasLinked = (from: string, to: string): boolean =>
    chain(from).some((a) =>
      chain(to).some((b) => previousEdges.has(`${a}\n${b}`) || previousEdges.has(`${b}\n${a}`)),
    );
  for (const s of drift.shadow) {
    if (styleBreaks.has(`${s.from}\n${s.to}`)) continue;
    if (covered(s.from, s.to)) continue;
    tasks.push({
      type: wasLinked(s.from, s.to) ? "remove-import" : "undeclared-import",
      from: s.from,
      to: s.to,
      evidence: s.evidence,
    });
  }
  for (const p of drift.phantom) {
    tasks.push({ type: "add-dependency", edgeId: p.edgeId, from: p.from, to: p.to, relationship: p.relationship });
  }

  return tasks.sort((a, b) => ORDER[a.type] - ORDER[b.type]);
}

/** One line per task, for people and agents. */
export function describeTask(t: GapTask): string {
  switch (t.type) {
    case "move-code":
      return `move the code of \`${t.node}\` from ${t.from} to ${t.to}, fix imports, then flip it to active`;
    case "create-code":
      return `create the code for \`${t.node}\` at ${t.path}`;
    case "finish":
      return `\`${t.node}\` now has code at ${t.path} — flip it from proposed to active`;
    case "remove-import":
      return `the edge \`${t.from}\` → \`${t.to}\` was removed from the model — remove the import: ${t.evidence.map((e) => `${e.file} imports "${e.specifier}"`).join("; ")}`;
    case "undeclared-import":
      return `\`${t.from}\` imports \`${t.to}\` but the model never had that edge — ask the architect: add the edge, or remove the import: ${t.evidence.map((e) => `${e.file} imports "${e.specifier}"`).join("; ")}`;
    case "add-dependency":
      return `the model says \`${t.from}\` ${t.relationship} \`${t.to}\` (edge ${t.edgeId}) but no import exists yet — wire it`;
    case "style-break":
      return `${t.message} Evidence: ${t.evidence.map((e) => `${e.file} imports "${e.specifier}"`).join("; ")}`;
  }
}
