/**
 * `archik otel check --graph <file>` — verify the diagram against a
 * production service-dependency graph (Jaeger /api/dependencies
 * JSON, or any export with {parent, child, callCount} entries).
 *
 * Mapping: graph service names bind to nodes via
 * `metadata.otelService`, falling back to the node id. Undeclared
 * runtime calls fail the check (exit 1); declared wire edges that
 * saw no traffic are reported informationally.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  checkOtelGraph,
  parseServiceGraph,
  type OtelCheckResult,
} from "../../domain/otel.ts";
import type { Document } from "../../domain/types.ts";
import { discoverDocs } from "../../io/discovery.ts";
import { bold, cross, cyan, dim, tick, yellow } from "../colors.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { projectRoot, resolveDocPath } from "../resolveDocPath.ts";

const isJson = (opts: ParsedOptions): boolean => {
  const v = getString(opts, "json");
  return v !== undefined && v !== "false" && v !== "0";
};

export async function otelCommand(opts: ParsedOptions): Promise<number> {
  const sub = opts._[0];
  const json = isJson(opts);
  const graphPath = getString(opts, "graph");
  if (sub !== "check" || graphPath === undefined || graphPath === "true") {
    const msg = "Usage: archik otel check --graph <dependencies.json> [--json]";
    if (json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(`${cross()} ${msg}`);
    return 2;
  }

  let abs: string;
  try {
    abs = await resolveDocPath(getString(opts, "doc"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ ok: false, error: message }));
    else console.error(`${cross()} ${message}`);
    return 2;
  }
  const root = projectRoot(abs);

  let calls;
  try {
    calls = parseServiceGraph(
      JSON.parse(await readFile(path.resolve(graphPath), "utf-8")),
    );
  } catch (err) {
    const message = `${graphPath}: ${err instanceof Error ? err.message : String(err)}`;
    if (json) console.log(JSON.stringify({ ok: false, error: message }));
    else console.error(`${cross()} ${message}`);
    return 2;
  }

  const discovery = await discoverDocs(abs, root);
  const rootError = discovery.errors.find((e) => e.abs === abs);
  if (rootError !== undefined) {
    if (json) console.log(JSON.stringify({ ok: false, error: rootError.message }));
    else console.error(`${cross()} ${rootError.relPath}: ${rootError.message}`);
    return 2;
  }
  const merged: Document = {
    version: "1.0",
    name: "merged",
    nodes: discovery.docs.flatMap((d) => d.doc.nodes),
    edges: discovery.docs.flatMap((d) => d.doc.edges),
  };

  const result = checkOtelGraph(merged, calls);

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: result.undeclared.length === 0,
          undeclared: result.undeclared,
          unobserved: result.unobserved,
          unmappedServices: result.unmappedServices,
          observedNodes: Object.keys(result.observed).length,
        },
        null,
        2,
      ),
    );
  } else {
    printText(result);
  }
  return result.undeclared.length > 0 ? 1 : 0;
}

function printText(result: OtelCheckResult): void {
  if (result.undeclared.length > 0) {
    console.log(
      `\n${result.undeclared.length} UNDECLARED CALL${result.undeclared.length !== 1 ? "S" : ""} — production traffic with no edge in the diagram`,
    );
    for (const u of result.undeclared) {
      const count = u.callCount > 0 ? dim(`  (${u.callCount} calls)`) : "";
      console.log(
        `  ${cross()} ${cyan(`${u.fromNode} → ${u.toNode}`)}  services ${u.fromService} → ${u.toService}${count}`,
      );
    }
  }
  if (result.unobserved.length > 0) {
    console.log(
      `\n${result.unobserved.length} UNOBSERVED EDGE${result.unobserved.length !== 1 ? "S" : ""} — declared wire edges with no traffic in this window ${dim("(informational)")}`,
    );
    for (const u of result.unobserved) {
      console.log(`  ${yellow("?")} ${u.edgeId.padEnd(24)} ${u.from} → ${u.to} (${u.relationship})`);
    }
  }
  if (result.unmappedServices.length > 0) {
    console.log(
      `\n${result.unmappedServices.length} UNMAPPED SERVICE${result.unmappedServices.length !== 1 ? "S" : ""} — graph names no node claims ${dim("(set metadata.otelService)")}`,
    );
    for (const s of result.unmappedServices) console.log(`  ${yellow("?")} ${s}`);
  }
  const observedCount = Object.keys(result.observed).length;
  if (result.undeclared.length === 0) {
    console.log(
      `\n${tick()} runtime graph matches the diagram — ${observedCount} node${observedCount === 1 ? "" : "s"} observed`,
    );
  } else {
    console.log(
      `\n${bold("otel check")}: ${result.undeclared.length} undeclared call${result.undeclared.length === 1 ? "" : "s"} — add the edges or fix the routing`,
    );
  }
}
