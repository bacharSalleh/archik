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
});
