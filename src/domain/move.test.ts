import { describe, expect, it } from "vitest";
import { moveNode } from "./move.ts";
import type { Document } from "./types.ts";

const n = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, kind: "module", name: id, description: "x", ...extra }) as Document["nodes"][number];

const doc: Document = {
  version: "1.0",
  name: "x",
  nodes: [
    n("billing", { sourcePath: "src/billing" }),
    n("orders", { sourcePath: "src/orders" }),
    n("invoices", { kind: "service", sourcePath: "src/invoices" }),
    n("notes", { kind: "external" }),
    n("checkout", { kind: "service", sourcePath: "src/orders/checkout", parentId: "orders" }),
  ],
  edges: [{ id: "c-b", from: "checkout", to: "billing", relationship: "uses" }],
};

describe("moveNode", () => {
  it("re-parents a built node and plans its code move into the new folder", () => {
    const r = moveNode(doc, "invoices", "billing");
    expect(r.ok).toBe(true);
    const moved = r.ok ? r.doc.nodes.find((x) => x.id === "invoices")! : null;
    expect(moved).toMatchObject({ parentId: "billing", sourcePath: "src/billing/invoices", status: "proposed" });
    expect(r.ok && r.plannedMove).toEqual({ from: "src/invoices", to: "src/billing/invoices" });
  });

  it("moves to the top level without touching the path", () => {
    const r = moveNode(doc, "checkout", undefined);
    const moved = r.ok ? r.doc.nodes.find((x) => x.id === "checkout")! : null;
    expect(moved?.parentId).toBeUndefined();
    expect(moved?.sourcePath).toBe("src/orders/checkout");
    expect(moved?.status).toBeUndefined();
  });

  it("keeps the path when it already sits inside the new parent", () => {
    const d: Document = { ...doc, nodes: [...doc.nodes, n("inner", { kind: "service", sourcePath: "src/billing/inner" })] };
    const r = moveNode(d, "inner", "billing");
    expect(r.ok && r.plannedMove).toBeNull();
  });

  it("refuses to move a node into itself or its own child", () => {
    expect(moveNode(doc, "orders", "orders")).toMatchObject({ ok: false });
    const r = moveNode(doc, "orders", "checkout");
    expect(!r.ok && r.error).toMatch(/inside itself/);
  });

  it("refuses a move that would put an edge between a node and its container", () => {
    const r = moveNode(doc, "checkout", "billing");
    expect(!r.ok && r.error).toMatch(/c-b/);
  });
});
