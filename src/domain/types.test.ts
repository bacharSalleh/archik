import { describe, it, expect } from "vitest";
import type {
  Document,
  DocumentMetadata,
  Edge,
  Interface,
  Node,
  NodeKind,
  Relationship,
} from "./types.ts";
import {
  DocumentSchema,
  EdgeSchema,
  InterfaceSchema,
  NodeSchema,
} from "./schema.ts";

describe("types module", () => {
  it("Node type aligns with NodeSchema parse output", () => {
    const node: Node = NodeSchema.parse({
      id: "api",
      kind: "service",
      name: "API",
    });
    const kind: NodeKind = node.kind;
    expect(kind).toBe("service");
  });

  it("Interface type aligns with InterfaceSchema", () => {
    const iface: Interface = InterfaceSchema.parse({
      name: "POST /x",
      protocol: "http",
    });
    expect(iface.name).toBe("POST /x");
  });

  it("Edge type aligns with EdgeSchema", () => {
    const edge: Edge = EdgeSchema.parse({
      id: "e1",
      from: "a",
      to: "b",
      relationship: "writes",
    });
    const rel: Relationship = edge.relationship;
    expect(rel).toBe("writes");
  });

  it("Document type aligns with DocumentSchema (with metadata)", () => {
    const doc: Document = DocumentSchema.parse({
      version: "1.0",
      name: "Demo",
      nodes: [],
      edges: [],
      metadata: {
        createdAt: "2026-04-25T00:00:00Z",
        updatedAt: "2026-04-25T00:00:00Z",
      },
    });
    const meta: DocumentMetadata | undefined = doc.metadata;
    expect(meta?.createdAt).toBe("2026-04-25T00:00:00Z");
    expect(doc.version).toBe("1.0");
  });
});
