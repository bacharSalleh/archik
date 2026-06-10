/**
 * Runtime verification — compare the declared edges with what
 * production actually does. Input is a service-dependency graph as
 * exported by tracing backends (Jaeger's GET /api/dependencies shape,
 * with or without the {data: …} wrapper; Tempo/Grafana service-graph
 * exports use the same parent/child/callCount triple).
 *
 * Mapping: a graph service name binds to the node whose
 * `metadata.otelService` equals it, falling back to the node id.
 * Names that bind to nothing are reported, not guessed at.
 *
 * Findings:
 *   UNDECLARED CALL  the runtime shows service A calling service B,
 *                    but no edge connects their nodes — production
 *                    traffic the diagram doesn't admit to. Hard
 *                    finding (drives the exit code).
 *   UNOBSERVED EDGE  a wire-relationship edge (http_call, grpc,
 *                    websocket, webhook, invokes, routes_to) between
 *                    two OBSERVED services has no runtime calls in
 *                    the window. Informational — rare paths and
 *                    batch flows legitimately go quiet.
 *
 * Pure function; the CLI owns file reading and exit codes.
 */
import type { Document, Node } from "./types.ts";

export type ServiceCall = {
  parent: string;
  child: string;
  callCount?: number;
};

const WIRE_RELATIONSHIPS = new Set([
  "http_call",
  "grpc",
  "websocket",
  "webhook",
  "invokes",
  "routes_to",
]);

export type UndeclaredCall = {
  fromService: string;
  toService: string;
  fromNode: string;
  toNode: string;
  callCount: number;
};

export type UnobservedEdge = {
  edgeId: string;
  from: string;
  to: string;
  relationship: string;
};

export type OtelCheckResult = {
  undeclared: UndeclaredCall[];
  unobserved: UnobservedEdge[];
  /** Graph service names that bind to no node. */
  unmappedServices: string[];
  /** node id → service name actually observed. */
  observed: Record<string, string>;
};

/** Normalise the common export shapes into ServiceCall[]. */
export function parseServiceGraph(raw: unknown): ServiceCall[] {
  const data =
    raw !== null && typeof raw === "object" && "data" in raw
      ? (raw as { data: unknown }).data
      : raw;
  if (!Array.isArray(data)) {
    throw new Error(
      "expected a JSON array of {parent, child, callCount} (Jaeger /api/dependencies shape, with or without a data wrapper)",
    );
  }
  const calls: ServiceCall[] = [];
  for (const entry of data) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      typeof (entry as ServiceCall).parent !== "string" ||
      typeof (entry as ServiceCall).child !== "string"
    ) {
      throw new Error(
        "every entry needs string `parent` and `child` fields (and an optional numeric `callCount`)",
      );
    }
    calls.push(entry as ServiceCall);
  }
  return calls;
}

function otelServiceOf(node: Node): string | undefined {
  const v = node.metadata?.["otelService"];
  return typeof v === "string" && v !== "" ? v : undefined;
}

export function checkOtelGraph(
  doc: Document,
  calls: ServiceCall[],
): OtelCheckResult {
  // service name → node id: explicit metadata.otelService wins, node
  // id is the fallback. Explicit bindings shadow id collisions.
  const byService = new Map<string, string>();
  for (const node of doc.nodes) byService.set(node.id, node.id);
  for (const node of doc.nodes) {
    const svc = otelServiceOf(node);
    if (svc !== undefined) byService.set(svc, node.id);
  }

  const connected = new Set<string>();
  for (const edge of doc.edges) {
    connected.add(`${edge.from} ${edge.to}`);
    connected.add(`${edge.to} ${edge.from}`);
  }

  const undeclared: UndeclaredCall[] = [];
  const seenUndeclared = new Set<string>();
  const unmapped = new Set<string>();
  const observedPairs = new Set<string>();
  const observed: Record<string, string> = {};

  for (const call of calls) {
    const fromNode = byService.get(call.parent);
    const toNode = byService.get(call.child);
    if (fromNode === undefined) unmapped.add(call.parent);
    if (toNode === undefined) unmapped.add(call.child);
    if (fromNode === undefined || toNode === undefined) continue;
    observed[fromNode] = call.parent;
    observed[toNode] = call.child;
    if (fromNode === toNode) continue;
    observedPairs.add(`${fromNode} ${toNode}`);
    observedPairs.add(`${toNode} ${fromNode}`);
    if (connected.has(`${fromNode} ${toNode}`)) continue;
    const key = `${fromNode} ${toNode}`;
    if (seenUndeclared.has(key)) continue;
    seenUndeclared.add(key);
    undeclared.push({
      fromService: call.parent,
      toService: call.child,
      fromNode,
      toNode,
      callCount: call.callCount ?? 0,
    });
  }

  const unobserved: UnobservedEdge[] = [];
  for (const edge of doc.edges) {
    if (!WIRE_RELATIONSHIPS.has(edge.relationship)) continue;
    if ((edge.status ?? "active") !== "active") continue;
    if (edge.fromFile !== undefined || edge.toFile !== undefined) continue;
    // Only judge edges whose BOTH endpoints showed up in the graph at
    // all — a service that never reported isn't evidence of anything.
    if (observed[edge.from] === undefined || observed[edge.to] === undefined) {
      continue;
    }
    if (observedPairs.has(`${edge.from} ${edge.to}`)) continue;
    unobserved.push({
      edgeId: edge.id,
      from: edge.from,
      to: edge.to,
      relationship: edge.relationship,
    });
  }

  return {
    undeclared,
    unobserved,
    unmappedServices: [...unmapped].sort(),
    observed,
  };
}
