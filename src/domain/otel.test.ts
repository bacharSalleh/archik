import { describe, expect, it } from "vitest";
import { checkOtelGraph, parseServiceGraph } from "./otel.ts";
import type { Document, Node } from "./types.ts";

const node = (id: string, extra: Partial<Node> = {}): Node => ({
  id,
  kind: "external",
  name: id,
  description: "x",
  ...extra,
});

const doc = (nodes: Node[], edges: Document["edges"]): Document => ({
  version: "1.0",
  name: "Demo",
  nodes,
  edges,
});

describe("parseServiceGraph", () => {
  it("accepts the raw array and the data-wrapped shapes", () => {
    const arr = [{ parent: "a", child: "b", callCount: 3 }];
    expect(parseServiceGraph(arr)).toEqual(arr);
    expect(parseServiceGraph({ data: arr })).toEqual(arr);
  });

  it("rejects malformed entries", () => {
    expect(() => parseServiceGraph({ nope: true })).toThrow(/array/);
    expect(() => parseServiceGraph([{ parent: "a" }])).toThrow(/child/);
  });
});

describe("checkOtelGraph", () => {
  const nodes = [
    node("api"),
    node("billing", { metadata: { otelService: "billing-svc" } }),
    node("db"),
  ];

  it("flags runtime calls with no declared edge", () => {
    const d = doc(nodes, [
      { id: "api-db", from: "api", to: "db", relationship: "http_call" },
    ]);
    const result = checkOtelGraph(d, [
      { parent: "api", child: "db", callCount: 10 },
      { parent: "api", child: "billing-svc", callCount: 5 },
    ]);
    expect(result.undeclared).toHaveLength(1);
    expect(result.undeclared[0]).toMatchObject({
      fromNode: "api",
      toNode: "billing",
      toService: "billing-svc",
      callCount: 5,
    });
  });

  it("binds services via metadata.otelService with node-id fallback", () => {
    const d = doc(nodes, [
      { id: "a-b", from: "api", to: "billing", relationship: "http_call" },
    ]);
    const result = checkOtelGraph(d, [
      { parent: "api", child: "billing-svc" },
    ]);
    expect(result.undeclared).toEqual([]);
    expect(result.unmappedServices).toEqual([]);
  });

  it("treats either-direction edges as declared", () => {
    const d = doc(nodes, [
      { id: "db-api", from: "db", to: "api", relationship: "invokes" },
    ]);
    const result = checkOtelGraph(d, [{ parent: "api", child: "db" }]);
    expect(result.undeclared).toEqual([]);
  });

  it("reports unmapped service names instead of guessing", () => {
    const d = doc(nodes, []);
    const result = checkOtelGraph(d, [
      { parent: "api", child: "mystery-svc" },
    ]);
    expect(result.unmappedServices).toEqual(["mystery-svc"]);
    expect(result.undeclared).toEqual([]);
  });

  it("reports unobserved wire edges only when both endpoints reported", () => {
    const d = doc(nodes, [
      { id: "api-db", from: "api", to: "db", relationship: "http_call" },
      { id: "api-billing", from: "api", to: "billing", relationship: "grpc" },
      // structural relationship — never judged by runtime traffic
      { id: "billing-db", from: "billing", to: "db", relationship: "depends_on" },
    ]);
    const result = checkOtelGraph(d, [
      { parent: "api", child: "db" },
      { parent: "billing-svc", child: "db" },
    ]);
    // api ↔ billing both observed, no traffic on the grpc edge.
    expect(result.unobserved).toHaveLength(1);
    expect(result.unobserved[0]).toMatchObject({ edgeId: "api-billing" });
  });

  it("skips proposed edges in unobserved checks", () => {
    const d = doc(nodes, [
      { id: "api-db", from: "api", to: "db", relationship: "http_call", status: "proposed" },
    ]);
    const result = checkOtelGraph(d, [
      { parent: "api", child: "billing-svc" },
      { parent: "billing-svc", child: "db" },
    ]);
    expect(result.unobserved).toEqual([]);
  });
});
