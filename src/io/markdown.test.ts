import { describe, it, expect } from "vitest";
import { exportMarkdown } from "./markdown.ts";
import { ordersDocument } from "../domain/__fixtures__/orders.ts";
import type { Document } from "../domain/types.ts";

const empty: Document = {
  version: "1.0",
  name: "Empty",
  nodes: [],
  edges: [],
};

describe("exportMarkdown", () => {
  it("starts with the document name as a top-level heading", () => {
    const md = exportMarkdown(ordersDocument);
    expect(md).toMatch(/^# Orders Platform/m);
  });

  it("includes the document description when present", () => {
    const md = exportMarkdown(ordersDocument);
    expect(md).toContain("Reference architecture used as a domain fixture");
  });

  it("renders a Components section", () => {
    const md = exportMarkdown(ordersDocument);
    expect(md).toMatch(/^## Components/m);
  });

  it("includes every node by name", () => {
    const md = exportMarkdown(ordersDocument);
    for (const node of ordersDocument.nodes) {
      expect(md).toContain(node.name);
    }
  });

  it("labels each component with its kind", () => {
    const md = exportMarkdown(ordersDocument);
    expect(md).toMatch(/Orders API.*\(service\)/);
    expect(md).toMatch(/Orders DB.*\(database\)/);
  });

  it("lists responsibilities and stack when present", () => {
    const md = exportMarkdown(ordersDocument);
    expect(md).toContain("accept orders");
    expect(md).toContain("Postgres 16");
  });

  it("lists interfaces when present", () => {
    const md = exportMarkdown(ordersDocument);
    expect(md).toContain("POST /orders");
  });

  it("renders a Connections section", () => {
    const md = exportMarkdown(ordersDocument);
    expect(md).toMatch(/^## Connections/m);
  });

  it("describes each edge using its relationship", () => {
    const md = exportMarkdown(ordersDocument);
    expect(md).toMatch(/Orders API.+writes.+Orders DB/);
    expect(md).toMatch(/Orders API.+publishes.+Order Events/);
    expect(md).toMatch(/Fulfillment Worker.+subscribes.+Order Events/);
  });

  it("includes edge labels when present", () => {
    const md = exportMarkdown(ordersDocument);
    expect(md).toContain("place order");
    expect(md).toContain("order.placed");
  });

  it("renders an empty document without throwing", () => {
    expect(() => exportMarkdown(empty)).not.toThrow();
    const md = exportMarkdown(empty);
    expect(md).toMatch(/^# Empty/m);
  });

  it("includes status badge for proposed nodes", () => {
    const doc: Document = {
      version: "1.0",
      name: "Lifecycle",
      nodes: [
        {
          id: "planned-svc",
          kind: "service",
          name: "Planned Service",
          description: "Not built yet",
          status: "proposed",
        },
      ],
      edges: [],
    };
    const md = exportMarkdown(doc);
    expect(md).toContain("proposed");
  });

  it("includes status badge for deprecated nodes", () => {
    const doc: Document = {
      version: "1.0",
      name: "Lifecycle",
      nodes: [
        {
          id: "old-svc",
          kind: "service",
          name: "Old Service",
          description: "Being phased out",
          status: "deprecated",
        },
      ],
      edges: [],
    };
    const md = exportMarkdown(doc);
    expect(md).toContain("deprecated");
  });

  it("includes status badge for proposed edges", () => {
    const doc: Document = {
      version: "1.0",
      name: "EdgeStatus",
      nodes: [
        { id: "a", kind: "service", name: "A", description: "test" },
        { id: "b", kind: "service", name: "B", description: "test" },
      ],
      edges: [
        { id: "a-b", from: "a", to: "b", relationship: "http_call", status: "proposed" },
      ],
    };
    const md = exportMarkdown(doc);
    expect(md).toContain("proposed");
  });

  it("includes status badge for deprecated edges", () => {
    const doc: Document = {
      version: "1.0",
      name: "EdgeStatus",
      nodes: [
        { id: "a", kind: "service", name: "A", description: "test" },
        { id: "b", kind: "service", name: "B", description: "test" },
      ],
      edges: [
        { id: "a-b", from: "a", to: "b", relationship: "http_call", status: "deprecated" },
      ],
    };
    const md = exportMarkdown(doc);
    expect(md).toContain("deprecated");
  });

  it("lists notes when present", () => {
    const doc: Document = {
      version: "1.0",
      name: "Notes Test",
      nodes: [
        {
          id: "svc",
          kind: "external",
          name: "Service",
          description: "test fixture",
          notes: ["check the runbook", "rate limited at 1000 rps"],
        },
      ],
      edges: [],
    };
    const md = exportMarkdown(doc);
    expect(md).toContain("check the runbook");
    expect(md).toContain("rate limited at 1000 rps");
  });

  it("omits notes section when node has no notes", () => {
    const doc: Document = {
      version: "1.0",
      name: "No Notes",
      nodes: [
        { id: "svc", kind: "external", name: "Service", description: "test fixture" },
      ],
      edges: [],
    };
    const md = exportMarkdown(doc);
    expect(md).not.toContain("notes");
  });

  it("omits status for active nodes (active is default, not shown)", () => {
    const doc: Document = {
      version: "1.0",
      name: "Lifecycle",
      nodes: [
        {
          id: "live-svc",
          kind: "service",
          name: "Live Service",
          description: "Built and running",
        },
      ],
      edges: [],
    };
    const md = exportMarkdown(doc);
    expect(md).not.toContain("status");
  });
});
