/**
 * `archik q ...` — agent-friendly query CLI over the project's
 * archik documents. Subcommand surface kept narrow on purpose so
 * agents (and humans) can memorise it; everything below is a thin
 * shape over the pure functions in src/domain/query.ts.
 */
import { discoverDocs, type LoadedDoc } from "../../io/discovery.ts";
import { discoverSeqDocs } from "../../io/seq-discovery.ts";
import { discoverUseCaseDocs } from "../../io/usecase-discovery.ts";
import { discoverActorDocs } from "../../io/actor-discovery.ts";
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
                  --status <s>    filter by lifecycle status (active, proposed, deprecated)
                  --search <t>    case-insensitive substring match on name or description
  edges                    All edges
                  --from <id>     filter by source
                  --to <id>       filter by target
                  --rel <name>    filter by relationship
                  --status <s>    filter by lifecycle status (active, proposed, deprecated)
  impact <id>              Edges/children that would orphan if removed,
                           plus transitive dependents
  stats                    Counts: files, nodes, edges, kinds, relationships
  sequences                All sequence diagram files (.archik.seq.yaml)
                  --node <id>    filter to flows involving that architecture node id
  usecases                 All use case files (.archik.uc.yaml)
                  --actor <id>   filter to use cases involving that actor
  describe-usecase <id>    Use case detail: actors, flows, slices, realizations
  actors                   All actors (across .archik.actors.yaml files)

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

function fmtStatusBadge(status: string | undefined): string {
  if (!status || status === "active") return "";
  if (status === "proposed") return ` ${dim("[proposed]")}`;
  if (status === "deprecated") return ` ${yellow("[deprecated]")}`;
  return ` ${dim(`[${status}]`)}`;
}

function fmtNodeRow(n: FoundNode): string {
  const stack = n.node.stack ? `  ${dim(n.node.stack)}` : "";
  const badge = fmtStatusBadge(n.node.status);
  return `${cyan(n.node.kind.padEnd(10))} ${bold(n.node.id.padEnd(24))} ${n.node.name}${stack}${badge}  ${gray(n.relPath)}`;
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
  if (n.status && n.status !== "active") {
    const badge = n.status === "proposed" ? dim(n.status) : yellow(n.status);
    console.log(`  ${bold("status")}: ${badge}`);
  }
  if (n.stack) console.log(`  ${bold("stack")}: ${n.stack}`);
  if (n.stereotype) console.log(`  ${bold("stereotype")}: ${n.stereotype}`);
  if (n.description) console.log(`  ${bold("description")}: ${n.description}`);
  if (n.sourcePath) console.log(`  ${bold("sourcePath")}: ${n.sourcePath}`);
  if (n.parentId) console.log(`  ${bold("parentId")}: ${n.parentId}`);
  if (n.archikFile) console.log(`  ${bold("archikFile")}: ${n.archikFile}`);
  if (n.responsibilities && n.responsibilities.length > 0) {
    console.log(`  ${bold("responsibilities")}:`);
    for (const r of n.responsibilities) console.log(`    - ${r}`);
  }
  if (n.interfaces && n.interfaces.length > 0) {
    console.log(`  ${bold("interfaces")}:`);
    for (const iface of n.interfaces) {
      const desc = iface.description ? `  ${dim(iface.description)}` : "";
      console.log(`    - ${bold(iface.name)}  ${dim(iface.protocol)}${desc}`);
    }
  }
  if (n.notes && n.notes.length > 0) {
    console.log(`  ${bold("notes")}:`);
    for (const note of n.notes) console.log(`    - ${note}`);
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
  const statusArg = getString(opts, "status");
  const search = getString(opts, "search");
  if (kind !== undefined) filters.kind = kind as NodeKind;
  if (parent !== undefined) filters.parent = parent;
  if (file !== undefined) filters.file = file;
  if (search !== undefined) filters.search = search;
  if (statusArg !== undefined) {
    if (statusArg !== "active" && statusArg !== "proposed" && statusArg !== "deprecated") {
      console.error(`${cross()} --status must be active, proposed, or deprecated`);
      return 2;
    }
    filters.status = statusArg;
  }
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
  const statusArg = getString(opts, "status");
  if (from !== undefined) filters.from = from;
  if (to !== undefined) filters.to = to;
  if (rel !== undefined) filters.rel = rel as Relationship;
  if (statusArg !== undefined) {
    if (statusArg !== "active" && statusArg !== "proposed" && statusArg !== "deprecated") {
      console.error(`${cross()} --status must be active, proposed, or deprecated`);
      return 2;
    }
    filters.status = statusArg;
  }
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

async function sequencesCommand(
  opts: ParsedOptions,
  base: string,
): Promise<number> {
  const nodeFilter = getString(opts, "node");
  const json = isJson(opts);

  const { docs, errors } = await discoverSeqDocs(base);

  for (const e of errors) {
    if (!json) console.error(`${yellow("warn:")} ${e.relPath}: ${e.message}`);
  }

  const filtered = nodeFilter
    ? docs.filter((d) => d.doc.participants.some((p) => p.nodeId === nodeFilter))
    : docs;

  if (json) {
    printJson({
      ok: true,
      count: filtered.length,
      sequences: filtered.map((d) => ({
        relPath: d.relPath,
        name: d.doc.name,
        participants: d.doc.participants.map((p) => ({ id: p.id, nodeId: p.nodeId, label: p.label })),
      })),
    });
    return 0;
  }

  if (filtered.length === 0) {
    console.log("No sequence diagrams found.");
    if (nodeFilter) console.log(`(filtered by --node ${nodeFilter})`);
    return 0;
  }

  for (const d of filtered) {
    const participants = d.doc.participants.map((p) => p.nodeId).join(", ");
    console.log(`${d.doc.name}  ${d.relPath}`);
    console.log(`  participants: ${participants}`);
  }
  return 0;
}

async function useCasesCommand(
  opts: ParsedOptions,
  base: string,
): Promise<number> {
  const json = isJson(opts);
  const actorFilter = getString(opts, "actor");
  const { docs, errors } = await discoverUseCaseDocs(base);

  for (const e of errors) {
    if (!json) console.error(`${yellow("warn:")} ${e.relPath}: ${e.message}`);
  }

  const filtered = actorFilter
    ? docs.filter(
      (d) =>
        d.doc.primaryActor === actorFilter ||
        (d.doc.secondaryActors?.includes(actorFilter) ?? false),
    )
    : docs;

  if (json) {
    printJson({
      ok: true,
      count: filtered.length,
      useCases: filtered.map((d) => ({
        relPath: d.relPath,
        id: d.doc.id,
        name: d.doc.name,
        status: d.doc.status,
        primaryActor: d.doc.primaryActor,
        secondaryActors: d.doc.secondaryActors,
        slices: d.doc.slices.map((s) => ({
          id: s.id,
          description: s.description,
          status: s.status,
          flows: s.flows,
          tests: s.tests,
          realization: s.realization,
        })),
      })),
    });
    return filtered.length === 0 ? 1 : 0;
  }

  if (filtered.length === 0) {
    console.log("No use cases found.");
    if (actorFilter) console.log(`(filtered by --actor ${actorFilter})`);
    return 1;
  }

  for (const d of filtered) {
    const status = fmtStatusBadge(d.doc.status);
    console.log(`${bold(d.doc.id)}  ${d.doc.name}${status}  ${gray(d.relPath)}`);
    console.log(`  ${dim("primary:")} ${d.doc.primaryActor}`);
    if (d.doc.secondaryActors && d.doc.secondaryActors.length > 0) {
      console.log(`  ${dim("secondary:")} ${d.doc.secondaryActors.join(", ")}`);
    }
    console.log(`  ${dim("slices:")} ${d.doc.slices.map((s) => s.id).join(", ")}`);
  }
  return 0;
}

async function describeUseCaseCommand(
  opts: ParsedOptions,
  base: string,
): Promise<number> {
  const id = opts._[1];
  if (!id) {
    console.error(`${cross()} usage: archik q describe-usecase <id>`);
    return 2;
  }
  const json = isJson(opts);
  const { docs } = await discoverUseCaseDocs(base);
  const found = docs.find((d) => d.doc.id === id);
  if (found === undefined) {
    if (json) printJson({ ok: false, error: `use case "${id}" not found` });
    else console.error(`${cross()} use case "${id}" not found`);
    return 1;
  }
  if (json) {
    printJson({
      ok: true,
      file: found.relPath,
      useCase: found.doc,
    });
    return 0;
  }
  const uc = found.doc;
  console.log(`${bold(uc.id)}  ${uc.name}${fmtStatusBadge(uc.status)}  ${gray(found.relPath)}`);
  console.log(`  ${bold("goal")}: ${uc.goal}`);
  console.log(`  ${bold("primaryActor")}: ${uc.primaryActor}`);
  if (uc.secondaryActors && uc.secondaryActors.length > 0) {
    console.log(`  ${bold("secondaryActors")}: ${uc.secondaryActors.join(", ")}`);
  }
  if (uc.preconditions && uc.preconditions.length > 0) {
    console.log(`  ${bold("preconditions")}:`);
    for (const p of uc.preconditions) console.log(`    - ${p}`);
  }
  if (uc.postconditions && uc.postconditions.length > 0) {
    console.log(`  ${bold("postconditions")}:`);
    for (const p of uc.postconditions) console.log(`    - ${p}`);
  }
  console.log(`  ${bold("flows")}:`);
  console.log(`    ${cyan("basic")}:`);
  uc.flows.basic.steps.forEach((s, i) => {
    console.log(`      ${i + 1}. ${s}`);
  });
  if (uc.flows.alternates) {
    for (const alt of uc.flows.alternates) {
      console.log(`    ${cyan(alt.id)}  ${dim("(branches from " + alt.branchFrom + ")")}`);
      alt.steps.forEach((s, i) => {
        console.log(`      ${i + 1}. ${s}`);
      });
    }
  }
  console.log(`  ${bold("slices")}:`);
  for (const s of uc.slices) {
    const badge = fmtStatusBadge(s.status);
    console.log(`    ${cyan(s.id)}${badge}  ${dim(s.description)}`);
    console.log(`      ${dim("flows:")} ${s.flows.join(", ")}`);
    if (s.tests && s.tests.length > 0) {
      console.log(`      ${dim("tests:")} ${s.tests.join(", ")}`);
    }
    if (s.realization) {
      console.log(`      ${dim("realizes:")} ${s.realization.seqFile}`);
    }
  }
  return 0;
}

async function actorsCommand(
  opts: ParsedOptions,
  base: string,
): Promise<number> {
  const json = isJson(opts);
  const { docs, errors } = await discoverActorDocs(base);

  for (const e of errors) {
    if (!json) console.error(`${yellow("warn:")} ${e.relPath}: ${e.message}`);
  }

  const flat = docs.flatMap((d) =>
    d.doc.actors.map((a) => ({ actor: a, relPath: d.relPath })),
  );

  if (json) {
    printJson({
      ok: true,
      count: flat.length,
      actors: flat.map(({ actor, relPath }) => ({ actor, file: relPath })),
    });
    return flat.length === 0 ? 1 : 0;
  }

  if (flat.length === 0) {
    console.log("No actors found.");
    return 1;
  }

  for (const { actor, relPath } of flat) {
    const badge = fmtStatusBadge(actor.status);
    console.log(
      `${cyan(actor.kind.padEnd(16))} ${bold(actor.id.padEnd(20))} ${actor.description}${badge}  ${gray(relPath)}`,
    );
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
    case "sequences":
    case "usecases":
    case "describe-usecase":
    case "actors": {
      // Verify the root file loads before peering into the M1+ artifact
      // walks. Otherwise a corrupt main.archik.yaml gives "no use cases
      // found" with exit 1, indistinguishable from "no work yet". The
      // rest of `q` already gates on loadAll; mirror that.
      const load = await loadAll(opts);
      if (!load.ok) return load.exit;
      let abs: string;
      try {
        abs = await resolveDocPath(getString(opts, "doc"));
      } catch (err) {
        console.error(`${cross()} ${err instanceof Error ? err.message : String(err)}`);
        return 2;
      }
      const base = projectRoot(abs);
      if (sub === "sequences") return sequencesCommand(opts, base);
      if (sub === "usecases") return useCasesCommand(opts, base);
      if (sub === "describe-usecase") return describeUseCaseCommand(opts, base);
      return actorsCommand(opts, base);
    }
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

