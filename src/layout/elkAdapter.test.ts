import { describe, it, expect } from "vitest";
import { elkLayoutEngine } from "./elkAdapter.ts";
import type { Document } from "../domain/types.ts";
import { ordersDocument } from "../domain/__fixtures__/orders.ts";
import type { PositionedNode } from "./types.ts";

const empty: Document = {
  version: "1.0",
  name: "Empty",
  nodes: [],
  edges: [],
};

const single: Document = {
  version: "1.0",
  name: "Single",
  nodes: [{ id: "api", kind: "service", name: "API" }],
  edges: [],
};

const pair: Document = {
  version: "1.0",
  name: "Pair",
  nodes: [
    { id: "api", kind: "service", name: "API" },
    { id: "db", kind: "database", name: "DB" },
  ],
  edges: [{ id: "e1", from: "api", to: "db", relationship: "writes" }],
};

const hierarchy: Document = {
  version: "1.0",
  name: "Hierarchy",
  nodes: [
    { id: "platform", kind: "custom", name: "Platform" },
    {
      id: "api",
      kind: "service",
      name: "API",
      parentId: "platform",
    },
    {
      id: "db",
      kind: "database",
      name: "DB",
      parentId: "platform",
    },
  ],
  edges: [{ id: "e1", from: "api", to: "db", relationship: "writes" }],
};

function rectsOverlap(a: PositionedNode, b: PositionedNode): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

describe("elkLayoutEngine", () => {
  it("has the expected name", () => {
    expect(elkLayoutEngine.name).toBe("elk");
  });

  it("returns an empty layout for an empty document", async () => {
    const out = await elkLayoutEngine.layout(empty);
    expect(out.roots).toEqual([]);
    expect(out.edges).toEqual([]);
  });

  it("places a single node with positive size", async () => {
    const out = await elkLayoutEngine.layout(single);
    expect(out.roots).toHaveLength(1);
    const root = out.roots[0]!;
    expect(root.id).toBe("api");
    expect(root.width).toBeGreaterThan(0);
    expect(root.height).toBeGreaterThan(0);
    expect(Number.isFinite(root.x)).toBe(true);
    expect(Number.isFinite(root.y)).toBe(true);
  });

  it("lays a pair left-to-right (RIGHT direction) and emits an edge", async () => {
    const out = await elkLayoutEngine.layout(pair);
    expect(out.roots).toHaveLength(2);
    const api = out.roots.find((n) => n.id === "api")!;
    const db = out.roots.find((n) => n.id === "db")!;
    expect(api.x).toBeLessThan(db.x);
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0]!.id).toBe("e1");
    expect(out.edges[0]!.sections.length).toBeGreaterThan(0);
  });

  it("does not overlap nodes in the orders fixture", async () => {
    const out = await elkLayoutEngine.layout(ordersDocument);
    const flat: PositionedNode[] = [];
    const collect = (ns: PositionedNode[]) => {
      for (const n of ns) {
        flat.push(n);
        collect(n.children);
      }
    };
    collect(out.roots);
    for (let i = 0; i < flat.length; i++) {
      for (let j = i + 1; j < flat.length; j++) {
        const a = flat[i]!;
        const b = flat[j]!;
        if (a.id === b.parentId || b.id === a.parentId) continue;
        expect(
          rectsOverlap(a, b),
          `nodes ${a.id} and ${b.id} overlap`,
        ).toBe(false);
      }
    }
  });

  it("nests nodes with parentId under their parent", async () => {
    const out = await elkLayoutEngine.layout(hierarchy);
    expect(out.roots).toHaveLength(1);
    const platform = out.roots[0]!;
    expect(platform.id).toBe("platform");
    expect(platform.children).toHaveLength(2);
    const childIds = platform.children.map((c) => c.id).sort();
    expect(childIds).toEqual(["api", "db"]);
  });

  it("the parent's box contains its children (relative coords)", async () => {
    const out = await elkLayoutEngine.layout(hierarchy);
    const platform = out.roots[0]!;
    for (const child of platform.children) {
      expect(child.x).toBeGreaterThanOrEqual(0);
      expect(child.y).toBeGreaterThanOrEqual(0);
      expect(child.x + child.width).toBeLessThanOrEqual(platform.width);
      expect(child.y + child.height).toBeLessThanOrEqual(platform.height);
    }
  });
});
