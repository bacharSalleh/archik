import { describe, it, expect } from "vitest";
import { validateDocument } from "../validate.ts";
import { ordersDocument } from "./orders.ts";

describe("orders fixture", () => {
  it("validates against the schema", () => {
    const result = validateDocument(ordersDocument);
    expect(result.ok).toBe(true);
  });

  it("has every edge endpoint pointing at a defined node", () => {
    const ids = new Set(ordersDocument.nodes.map((n) => n.id));
    for (const edge of ordersDocument.edges) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
    }
  });
});
