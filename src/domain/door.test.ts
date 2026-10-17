import { describe, expect, it } from "vitest";
import { classifyChange, isStructuralChange } from "./door.ts";
import type { Document } from "./types.ts";

const base: Document = {
  version: "1.0",
  name: "Shop",
  nodes: [
    { id: "app", kind: "module", name: "App", description: "x" },
    { id: "checkout", kind: "service", name: "Checkout", description: "x", parentId: "app" },
    { id: "cart", kind: "module", name: "Cart", description: "x", parentId: "app" },
    { id: "stripe", kind: "external", name: "Stripe", description: "x" },
  ],
  edges: [],
};

const withNodes = (...nodes: Document["nodes"]): Document => ({ ...base, nodes: [...base.nodes, ...nodes] });

describe("classifyChange", () => {
  it("calls an internal addition a two-way door", () => {
    const after = withNodes({ id: "pricing", kind: "function", name: "P", description: "x", parentId: "checkout" });
    expect(classifyChange(base, after)).toEqual({ oneWay: false, needsCrossCutting: false, reasons: [] });
  });

  it.each(["database", "external", "gateway", "queue", "llm", "auth"] as const)(
    "flags an added %s as one-way and needing cross-cutting notes",
    (kind) => {
      const c = classifyChange(base, withNodes({ id: "x", kind, name: "X", description: "x" }));
      expect(c.oneWay).toBe(true);
      expect(c.needsCrossCutting).toBe(true);
      expect(c.reasons[0]).toEqual({ text: `adds ${kind} \`x\``, crossCutting: true });
    },
  );

  it("flags a new edge to an external system", () => {
    const after: Document = {
      ...base,
      edges: [{ id: "c-s", from: "checkout", to: "stripe", relationship: "http_call" }],
    };
    const c = classifyChange(base, after);
    expect(c.needsCrossCutting).toBe(true);
    expect(c.reasons.map((r) => r.text)).toEqual(["new dependency on external `stripe`"]);
  });

  it("flags removals, boundary moves and new top-level modules as one-way without cross-cutting", () => {
    const after: Document = {
      ...base,
      nodes: [
        { id: "app", kind: "module", name: "App", description: "x" },
        { id: "checkout", kind: "service", name: "Checkout", description: "x", parentId: "cart" },
        { id: "cart", kind: "module", name: "Cart", description: "x", parentId: "app" },
        { id: "stripe", kind: "external", name: "Stripe", description: "x" },
        { id: "billing", kind: "module", name: "Billing", description: "x" },
      ],
    };
    const removed: Document = { ...base, nodes: base.nodes.filter((n) => n.id !== "cart") };
    const moved = classifyChange(base, after);
    expect(moved.oneWay).toBe(true);
    expect(moved.needsCrossCutting).toBe(false);
    expect(moved.reasons.map((r) => r.text)).toEqual([
      "adds top-level module `billing`",
      "moves `checkout` from `app` to `cart`",
    ]);
    expect(classifyChange(base, removed).reasons.map((r) => r.text)).toEqual(["removes `cart`"]);
  });

  it("flags a style change and a layer move as one-way", () => {
    const styled: Document = { ...base, style: { kind: "layered" } };
    expect(classifyChange(base, styled).reasons.map((r) => r.text)).toEqual([
      "changes the architecture style from none to layered",
    ]);
    const layered: Document = {
      ...styled,
      nodes: base.nodes.map((x) => (x.id === "checkout" ? { ...x, layer: "application" } : x)),
    };
    const moved: Document = {
      ...styled,
      nodes: base.nodes.map((x) => (x.id === "checkout" ? { ...x, layer: "domain" } : x)),
    };
    expect(classifyChange(layered, moved).reasons.map((r) => r.text)).toEqual([
      "moves `checkout` from layer application to domain",
    ]);
  });

  it("does not count removing or adding proposed-only work as one-way", () => {
    const planned = withNodes({ id: "db", kind: "database", name: "DB", description: "x", status: "proposed" });
    expect(classifyChange(base, planned).needsCrossCutting).toBe(true); // still a data store decision
    expect(classifyChange(planned, base).reasons).toEqual([]); // dropping a plan is cheap
  });
});

describe("isStructuralChange", () => {
  it("ignores wording edits", () => {
    const renamed: Document = { ...base, nodes: base.nodes.map((x) => (x.id === "cart" ? { ...x, name: "Basket", description: "y" } : x)) };
    expect(isStructuralChange(base, renamed)).toBe(false);
  });
  it("counts moves, new nodes, new edges and style changes", () => {
    const moved: Document = { ...base, nodes: base.nodes.map((x) => (x.id === "cart" ? { ...x, parentId: "checkout" } : x)) };
    expect(isStructuralChange(base, moved)).toBe(true);
    expect(isStructuralChange(base, { ...base, edges: [{ id: "e", from: "app", to: "stripe", relationship: "uses" }] })).toBe(true);
    expect(isStructuralChange(base, { ...base, style: { kind: "layered" } })).toBe(true);
  });
});
