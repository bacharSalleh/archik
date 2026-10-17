import { describe, expect, it } from "vitest";
import { checkStyle, effectiveLayers, nodePlacement, StyleSchema, styleInfo } from "./style.ts";
import type { LoadedDoc } from "../io/discovery.ts";
import type { Document } from "./types.ts";

const load = (doc: Document): LoadedDoc[] => [{ abs: "/p/main", relPath: "main.archik.yaml", doc }];
const n = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, kind: "module", name: id, description: "x", ...extra }) as Document["nodes"][number];
const e = (from: string, to: string) =>
  ({ id: `${from}-${to}`, from, to, relationship: "uses" }) as Document["edges"][number];

describe("StyleSchema", () => {
  it("accepts each kind with its defaults", () => {
    for (const kind of ["layered", "hexagonal", "clean", "modular-monolith", "feature-slices"]) {
      expect(StyleSchema.safeParse({ kind }).success).toBe(true);
    }
  });
  it("rejects layers on module styles and shared on layered styles", () => {
    expect(StyleSchema.safeParse({ kind: "modular-monolith", layers: ["a", "b"] }).success).toBe(false);
    expect(StyleSchema.safeParse({ kind: "layered", shared: ["x"] }).success).toBe(false);
  });
  it("needs at least two distinct layers", () => {
    expect(StyleSchema.safeParse({ kind: "layered", layers: ["only"] }).success).toBe(false);
    expect(StyleSchema.safeParse({ kind: "layered", layers: ["a", "a"] }).success).toBe(false);
  });
});

describe("layered styles", () => {
  const doc = (edges: Document["edges"], extra: Document["nodes"] = []): Document => ({
    version: "1.0",
    name: "x",
    style: { kind: "layered" },
    nodes: [
      n("web", { layer: "presentation" }),
      n("orders", { layer: "application" }),
      n("order-model", { layer: "domain" }),
      n("repo", { layer: "infrastructure" }),
      n("pricing", { kind: "function", parentId: "orders" }),
      n("stripe", { kind: "external" }),
      ...extra,
    ],
    edges,
  });

  it("allows downward and same-layer dependencies", () => {
    const r = checkStyle(load(doc([e("web", "orders"), e("orders", "order-model"), e("order-model", "repo"), e("repo", "stripe")])));
    expect(r.errors).toEqual([]);
  });

  it("rejects an upward dependency with a fix hint", () => {
    const r = checkStyle(load(doc([e("repo", "web")])));
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.message).toContain("`repo` (infrastructure) depends on `web` (presentation)");
    expect(r.errors[0]!.message).toMatch(/fix:/);
  });

  it("children inherit their parent's layer", () => {
    expect(effectiveLayers(doc([]).nodes).get("pricing")).toBe("application");
    const r = checkStyle(load(doc([e("pricing", "web")])));
    expect(r.errors[0]!.message).toContain("`pricing` (application)");
  });

  it("only the outermost-for-infra layer may call outside systems", () => {
    const r = checkStyle(load(doc([e("orders", "stripe")])));
    expect(r.errors[0]!.message).toContain("only infrastructure may depend on outside systems");
  });

  it("rejects unknown layer names and hints at unassigned nodes", () => {
    const r = checkStyle(load(doc([], [n("misc"), n("bad", { layer: "service" })])));
    expect(r.errors[0]!.message).toContain('unknown layer "service"');
    expect(r.hints.join(" ")).toContain("misc");
  });

  it("hexagonal: the core may use its ports, but never an adapter", () => {
    const hex: Document = {
      version: "1.0",
      name: "x",
      style: { kind: "hexagonal" },
      nodes: [
        n("rest", { layer: "adapters" }),
        n("repo-port", { kind: "port", layer: "ports" }),
        n("core", { layer: "core" }),
        n("pg", { layer: "adapters" }),
      ],
      edges: [e("rest", "core"), e("core", "repo-port"), e("pg", "repo-port"), e("core", "pg")],
    };
    const errs = checkStyle(load(hex)).errors;
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("`core` (core) depends on `pg` (adapters)");
  });

  it("uses custom layers in the given order", () => {
    const custom: Document = {
      version: "1.0",
      name: "x",
      style: { kind: "hexagonal", layers: ["edge", "core"] },
      nodes: [n("a", { layer: "edge" }), n("b", { layer: "core" })],
      edges: [e("b", "a")],
    };
    expect(checkStyle(load(custom)).errors[0]!.message).toContain("`b` (core) depends on `a` (edge)");
  });

  it("custom layered layers: the bottom layer talks to outside systems", () => {
    const custom: Document = {
      version: "1.0",
      name: "x",
      style: { kind: "layered", layers: ["ui", "logic", "data"] },
      nodes: [n("a", { layer: "ui" }), n("d", { layer: "data" }), n("ext", { kind: "external" })],
      edges: [e("d", "ext"), e("a", "ext")],
    };
    const errs = checkStyle(load(custom)).errors;
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("only data may depend on outside systems");
  });
});

describe("module styles", () => {
  const mm = (kind: "modular-monolith" | "feature-slices", edges: Document["edges"]): Document => ({
    version: "1.0",
    name: "x",
    style: { kind, shared: ["kernel"] },
    nodes: [
      n("billing"),
      n("billing-api", { kind: "interface", parentId: "billing" }),
      n("invoices", { kind: "service", parentId: "billing" }),
      n("orders"),
      n("checkout", { kind: "service", parentId: "orders" }),
      n("kernel"),
      n("money", { kind: "function", parentId: "kernel" }),
    ],
    edges,
  });

  it("modular monolith: allows the public interface and shared modules", () => {
    expect(checkStyle(load(mm("modular-monolith", [e("checkout", "billing-api"), e("checkout", "money")]))).errors).toEqual([]);
  });

  it("modular monolith: rejects reaching into another module's internals", () => {
    const r = checkStyle(load(mm("modular-monolith", [e("checkout", "invoices")])));
    expect(r.errors[0]!.message).toContain("`checkout` (module `orders`) reaches into `invoices` inside module `billing`");
  });

  it("feature slices: rejects any slice-to-slice dependency except shared", () => {
    const r = checkStyle(load(mm("feature-slices", [e("checkout", "billing-api"), e("checkout", "money")])));
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.message).toContain("slice `orders` depends on slice `billing`");
  });

  it("rejects layer fields and unknown shared ids", () => {
    const d = mm("modular-monolith", []);
    d.nodes.push(n("x", { layer: "domain" }));
    d.style = { kind: "modular-monolith", shared: ["nope"] };
    const msgs = checkStyle(load(d)).errors.map((x) => x.message).join("\n");
    expect(msgs).toContain('shared module "nope" does not exist');
    expect(msgs).toContain("`layer` is not used by the modular-monolith style");
  });
});

describe("nodePlacement", () => {
  const d: Document = {
    version: "1.0",
    name: "x",
    style: { kind: "hexagonal" },
    nodes: [n("rest", { layer: "adapters" }), n("core", { layer: "core" }), n("svc", { kind: "service", parentId: "core" })],
    edges: [],
  };
  it("says where a node sits and what it may use", () => {
    expect(nodePlacement(load(d), "svc")).toEqual({ style: "hexagonal", place: "layer core", mayDependOn: "ports, core" });
    expect(nodePlacement(load(d), "rest")!.mayDependOn).toBe("adapters, ports, core and outside systems");
  });
});

describe("no style / conflicts", () => {
  it("is a no-op without a style", () => {
    const d: Document = { version: "1.0", name: "x", nodes: [n("a"), n("b")], edges: [e("a", "b")] };
    expect(checkStyle(load(d))).toEqual({ style: null, errors: [], hints: [] });
  });
  it("rejects two different styles across files", () => {
    const a: Document = { version: "1.0", name: "a", style: { kind: "layered" }, nodes: [], edges: [] };
    const b: Document = { version: "1.0", name: "b", style: { kind: "hexagonal" }, nodes: [], edges: [] };
    const r = checkStyle([...load(a), { abs: "/p/b", relPath: "b.archik.yaml", doc: b }]);
    expect(r.errors[0]!.message).toMatch(/one architecture style/);
  });
  it("describes every kind", () => {
    expect(styleInfo("clean").layers).toEqual(["frameworks", "interface-adapters", "application", "domain"]);
  });
});
