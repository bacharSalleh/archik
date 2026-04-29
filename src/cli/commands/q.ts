/**
 * `archik q ...` — agent-friendly query CLI over the project's
 * archik documents. Subcommand surface kept narrow on purpose so
 * agents (and humans) can memorise it; everything below is a thin
 * shape over the pure functions in src/domain/query.ts.
 */
import { discoverDocs, type LoadedDoc } from "../../io/discovery.ts";
import {
  deps,
  dependents,
  findNode,
  impact,
  listEdges,
  listNodes,
  stats,
} from "../../domain/query.ts";
import type {
  EdgeFilters,
  FoundEdge,
  FoundNode,
  NodeFilters,
} from "../../domain/query.ts";
import type { NodeKind, Relationship } from "../../domain/types.ts";
import { bold, cross, cyan, dim, gray, tick, yellow } from "../colors.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { projectRoot, resolveDocPath } from "../resolveDocPath.ts";

type LoadResult =
  | { ok: true; docs: LoadedDoc[] }
  | { ok: false; exit: number };

async function loadAll(opts: ParsedOptions): Promise<LoadResult> {
  // q subcommands take node ids / filters as positionals, not file
  // paths. Use the default resolution (legacy or .archik/main), with
  // an explicit --doc <path> escape hatch.
  let abs: string;
  try {
    abs = await resolveDocPath(getString(opts, "doc"));
  } catch (err) {
    console.error(
      `${cross()} ${err instanceof Error ? err.message : String(err)}`,
    );
    return { ok: false, exit: 2 };
  }
  const base = projectRoot(abs);
  const result = await discoverDocs(abs, base);

  // Root must load. If it didn't, we'd silently miss every node that
  // lives in the root file — the most common case is "all of them" —
  // and report empty results as if the diagram had no such nodes.
  // Treat as fatal even when sub-files parsed fine.
  const rootError = result.errors.find((e) => e.abs === abs);
  if (rootError !== undefined) {
    console.error(`${cross()} ${rootError.relPath}: ${rootError.message}`);
    return { ok: false, exit: 2 };
  }
  if (result.docs.length === 0) {
    for (const e of result.errors) {
      console.error(`${cross()} ${e.relPath}: ${e.message}`);
    }
    return { ok: false, exit: 2 };
  }
  // Sub-file parse errors are non-fatal — they're optional architecture
  // detail. Surface them on stderr so they're visible without polluting
  // stdout JSON output.
  for (const e of result.errors) {
    console.error(`${yellow("warn:")} ${e.relPath}: ${e.message}`);
  }
  return { ok: true, docs: result.docs };
}

/** Match the lenient form used by validate/diff/suggest so `--json`,
 *  `--json=true`, and `--json=1` all enable JSON mode. */
const isJson = (opts: ParsedOptions): boolean => {
  const v = getString(opts, "json");
  return v !== undefined && v !== "false" && v !== "0";
};

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function printQHelp(): void {
  console.log(`archik q — query the architecture diagram

USAGE
  archik q <subcommand> [args] [--json]

SUBCOMMANDS
  describe <id>            Node + its incoming and outgoing edges
  deps <id>                Outgoing edges (what this node uses)
  dependents <id>          Incoming edges (what uses this node)
  list                     All nodes
                  --kind <k>      filter by kind (service, function, …)
                  --parent <id>   filter by container
                  --file <p>      filter by file (substring match)
  edges                    All edges
                  --from <id>     filter by source
                  --to <id>       filter by target
                  --rel <name>    filter by relationship
  impact <id>              Edges/children that would orphan if removed,
                           plus transitive dependents
  stats                    Counts: files, nodes, edges, kinds, relationships

OUTPUT
  Default: human-readable text.
  --json   stable structured output for agents (object on stdout).

GLOBAL FLAGS
  --doc <path>   query a non-default archik file (defaults to
                 .archik/main.archik.yaml or architecture.archik.yaml)

EXIT CODES
  0  query found a result
  1  query returned empty (e.g. no node with that id)
  2  could not load / parse the project's archik documents
`);
}

// ---------- formatting helpers ----------

function fmtEdge(e: FoundEdge): string {
  const label = e.edge.label ? ` ${dim(`"${e.edge.label}"`)}` : "";
  return `${e.edge.from} ${cyan("--[" + e.edge.relationship + "]-->")} ${e.edge.to}${label}  ${gray(e.relPath)}`;
}

function fmtNodeRow(n: FoundNode): string {
  const stack = n.node.stack ? `  ${dim(n.node.stack)}` : "";
  return `${cyan(n.node.kind.padEnd(10))} ${bold(n.node.id.padEnd(24))} ${n.node.name}${stack}  ${gray(n.relPath)}`;
}

// ---------- subcommand implementations ----------

async function qDescribe(opts: ParsedOptions): Promise<number> {
  const id = opts._[1];
  if (!id) {
    console.error(`${cross()} usage: archik q describe <id>`);
    return 2;
  }
  const load = await loadAll(opts);
  if (!load.ok) return load.exit;
  const docs = load.docs;
  const found = findNode(docs, id);
  if (!found.ok) {
    if (isJson(opts)) {
      printJson({ ok: false, error: found.error });
    } else {
      console.error(`${cross()} ${found.error}`);
    }
    return 1;
  }
  const outbound = deps(docs, id);
  const inbound = dependents(docs, id);

  if (isJson(opts)) {
    printJson({
      ok: true,
      file: found.found.relPath,
      node: found.found.node,
      outbound: outbound.map((e) => ({ edge: e.edge, file: e.relPath })),
      inbound: inbound.map((e) => ({ edge: e.edge, file: e.relPath })),
    });
    return 0;
  }

  const n = found.found.node;
  console.log(`${bold(n.id)}  ${dim("(" + n.kind + ")")}  ${gray(found.found.relPath)}`);
  console.log(`  ${bold("name")}: ${n.name}`);
  if (n.stack) console.log(`  ${bold("stack")}: ${n.stack}`);
  if (n.description) console.log(`  ${bold("description")}: ${n.description}`);
  if (n.parentId) console.log(`  ${bold("parentId")}: ${n.parentId}`);
  if (n.archikFile) console.log(`  ${bold("archikFile")}: ${n.archikFile}`);
  if (n.responsibilities && n.responsibilities.length > 0) {
    console.log(`  ${bold("responsibilities")}:`);
    for (const r of n.responsibilities) console.log(`    - ${r}`);
  }
  console.log("");
  console.log(
    `${bold("outbound")} (${outbound.length})${outbound.length === 0 ? "  " + dim("none") : ""}`,
  );
  for (const e of outbound) console.log(`  ${fmtEdge(e)}`);
  console.log(
    `${bold("inbound")} (${inbound.length})${inbound.length === 0 ? "   " + dim("none") : ""}`,
  );
  for (const e of inbound) console.log(`  ${fmtEdge(e)}`);
  return 0;
}

async function qDeps(opts: ParsedOptions): Promise<number> {
  const id = opts._[1];
  if (!id) {
    console.error(`${cross()} usage: archik q deps <id>`);
    return 2;
  }
  const load = await loadAll(opts);
  if (!load.ok) return load.exit;
  const found = findNode(load.docs, id);
  if (!found.ok) {
    if (isJson(opts)) {
      printJson({ ok: false, error: found.error });
    } else {
      console.error(`${cross()} ${found.error}`);
    }
    return 1;
  }
  const result = deps(load.docs, id);
  // Exit code reflects the data, not the format — agents and shell
  // scripts must see the same "found / empty" signal regardless of --json.
  const exit = result.length === 0 ? 1 : 0;
  if (isJson(opts)) {
    printJson({
      ok: true,
      id,
      count: result.length,
      edges: result.map((e) => ({ edge: e.edge, file: e.relPath })),
    });
    return exit;
  }
  if (result.length === 0) {
    console.log(`${tick()} ${id} has no outgoing edges`);
    return exit;
  }
  for (const e of result) console.log(fmtEdge(e));
  return exit;
}

async function qDependents(opts: ParsedOptions): Promise<number> {
  const id = opts._[1];
  if (!id) {
    console.error(`${cross()} usage: archik q dependents <id>`);
    return 2;
  }
  const load = await loadAll(opts);
  if (!load.ok) return load.exit;
  const found = findNode(load.docs, id);
  if (!found.ok) {
    if (isJson(opts)) {
      printJson({ ok: false, error: found.error });
    } else {
      console.error(`${cross()} ${found.error}`);
    }
    return 1;
  }
  const result = dependents(load.docs, id);
  const exit = result.length === 0 ? 1 : 0;
  if (isJson(opts)) {
    printJson({
      ok: true,
      id,
      count: result.length,
      edges: result.map((e) => ({ edge: e.edge, file: e.relPath })),
    });
    return exit;
  }
  if (result.length === 0) {
    console.log(`${tick()} ${id} has no incoming edges`);
    return exit;
  }
  for (const e of result) console.log(fmtEdge(e));
  return exit;
}

async function qList(opts: ParsedOptions): Promise<number> {
  const load = await loadAll(opts);
  if (!load.ok) return load.exit;
  const filters: NodeFilters = {};
  const kind = getString(opts, "kind");
  const parent = getString(opts, "parent");
  const file = getString(opts, "file");
  if (kind !== undefined) filters.kind = kind as NodeKind;
  if (parent !== undefined) filters.parent = parent;
  if (file !== undefined) filters.file = file;
  const result = listNodes(load.docs, filters);
  const exit = result.length === 0 ? 1 : 0;
  if (isJson(opts)) {
    printJson({
      ok: true,
      count: result.length,
      nodes: result.map((n) => ({ node: n.node, file: n.relPath })),
    });
    return exit;
  }
  if (result.length === 0) {
    console.log(`${tick()} no nodes match`);
    return exit;
  }
  for (const n of result) console.log(fmtNodeRow(n));
  return exit;
}

async function qEdges(opts: ParsedOptions): Promise<number> {
  const load = await loadAll(opts);
  if (!load.ok) return load.exit;
  const filters: EdgeFilters = {};
  const from = getString(opts, "from");
  const to = getString(opts, "to");
  const rel = getString(opts, "rel");
  if (from !== undefined) filters.from = from;
  if (to !== undefined) filters.to = to;
  if (rel !== undefined) filters.rel = rel as Relationship;
  const result = listEdges(load.docs, filters);
  const exit = result.length === 0 ? 1 : 0;
  if (isJson(opts)) {
    printJson({
      ok: true,
      count: result.length,
      edges: result.map((e) => ({ edge: e.edge, file: e.relPath })),
    });
    return exit;
  }
  if (result.length === 0) {
    console.log(`${tick()} no edges match`);
    return exit;
  }
  for (const e of result) console.log(fmtEdge(e));
  return exit;
}

async function qImpact(opts: ParsedOptions): Promise<number> {
  const id = opts._[1];
  if (!id) {
    console.error(`${cross()} usage: archik q impact <id>`);
    return 2;
  }
  const load = await loadAll(opts);
  if (!load.ok) return load.exit;
  const found = findNode(load.docs, id);
  if (!found.ok) {
    if (isJson(opts)) {
      printJson({ ok: false, error: found.error });
    } else {
      console.error(`${cross()} ${found.error}`);
    }
    return 1;
  }
  const result = impact(load.docs, id);
  if (isJson(opts)) {
    printJson({
      ok: true,
      id,
      danglingEdges: result.danglingEdges.map((e) => ({
        edge: e.edge,
        file: e.relPath,
      })),
      children: result.children.map((n) => ({ node: n.node, file: n.relPath })),
      transitiveDependents: result.transitiveDependents.map((n) => ({
        node: n.node,
        file: n.relPath,
      })),
    });
    return 0;
  }
  console.log(
    `${bold("dangling edges")} (${result.danglingEdges.length})${result.danglingEdges.length === 0 ? "  " + dim("none") : ""}`,
  );
  for (const e of result.danglingEdges) console.log(`  ${fmtEdge(e)}`);
  console.log(
    `${bold("orphaned children")} (${result.children.length})${result.children.length === 0 ? "  " + dim("none") : ""}`,
  );
  for (const c of result.children) console.log(`  ${fmtNodeRow(c)}`);
  console.log(
    `${bold("transitive dependents")} (${result.transitiveDependents.length})${result.transitiveDependents.length === 0 ? "  " + dim("none") : ""}`,
  );
  for (const d of result.transitiveDependents) {
    console.log(`  ${fmtNodeRow(d)}`);
  }
  return 0;
}

async function qStats(opts: ParsedOptions): Promise<number> {
  const load = await loadAll(opts);
  if (!load.ok) return load.exit;
  const s = stats(load.docs);
  if (isJson(opts)) {
    printJson({ ok: true, ...s });
    return 0;
  }
  console.log(`${bold("files")}: ${s.files}`);
  console.log(`${bold("nodes")}: ${s.nodes}`);
  console.log(`${bold("edges")}: ${s.edges}`);
  console.log(bold("kinds:"));
  for (const [k, v] of Object.entries(s.kinds).sort()) {
    console.log(`  ${k.padEnd(14)} ${v}`);
  }
  console.log(bold("relationships:"));
  for (const [r, v] of Object.entries(s.relationships).sort()) {
    console.log(`  ${r.padEnd(14)} ${v}`);
  }
  return 0;
}

// ---------- entry point ----------

export async function qCommand(opts: ParsedOptions): Promise<number> {
  const sub = opts._[0];
  switch (sub) {
    case "describe":
      return qDescribe(opts);
    case "deps":
      return qDeps(opts);
    case "dependents":
      return qDependents(opts);
    case "list":
      return qList(opts);
    case "edges":
      return qEdges(opts);
    case "impact":
      return qImpact(opts);
    case "stats":
      return qStats(opts);
    case undefined:
    case "help":
    case "--help":
    case "-h":
      printQHelp();
      return sub === undefined ? 2 : 0;
    default:
      console.error(`${cross()} unknown q subcommand: ${sub}\n`);
      printQHelp();
      return 2;
  }
}

