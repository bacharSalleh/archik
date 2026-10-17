import { describe, expect, it } from "vitest";
import { buildGap } from "./gap.ts";
import type { LoadedDoc } from "../io/discovery.ts";
import type { Document } from "./types.ts";
import type { ImportGraph } from "../drift/edge-drift.ts";

const n = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, kind: "module", name: id, description: "x", ...extra }) as Document["nodes"][number];
const load = (doc: Document): LoadedDoc[] => [{ abs: "/p/m", relPath: ".archik/main.archik.yaml", doc }];
const graph = (pairs: Array<[string, string]>, scannable: string[] = []): ImportGraph => ({
  pairs: pairs.map(([from, to]) => ({ from, to, evidence: [{ file: `src/${from}/x.ts`, specifier: `../${to}` }] })),
  scannable: new Set(scannable),
});

describe("buildGap", () => {
  it("is empty when model and code agree", () => {
    const doc: Document = {
      version: "1.0",
      name: "x",
      nodes: [n("a", { sourcePath: "src/a" }), n("b", { sourcePath: "src/b" })],
      edges: [{ id: "a-b", from: "a", to: "b", relationship: "depends_on" }],
    };
    const tasks = buildGap({
      docs: load(doc),
      exists: () => true,
      graph: graph([["a", "b"]], ["a", "b"]),
      previousSourcePaths: new Map(),
    });
    expect(tasks).toEqual([]);
  });

  it("asks to move code when a node's sourcePath changed and the old folder still exists", () => {
    const doc: Document = {
      version: "1.0",
      name: "x",
      nodes: [n("billing", { sourcePath: "src/billing" }), n("invoices", { sourcePath: "src/billing/invoices", parentId: "billing", status: "proposed" })],
      edges: [],
    };
    const tasks = buildGap({
      docs: load(doc),
      exists: (p) => p === "src/billing" || p === "src/invoices",
      graph: graph([]),
      previousSourcePaths: new Map([["invoices", "src/invoices"]]),
    });
    expect(tasks).toEqual([
      { type: "move-code", node: "invoices", from: "src/invoices", to: "src/billing/invoices" },
    ]);
  });

  it("asks to create code for a planned node and to finish one whose code now exists", () => {
    const doc: Document = {
      version: "1.0",
      name: "x",
      nodes: [n("new", { sourcePath: "src/new", status: "proposed" }), n("done", { sourcePath: "src/done", status: "proposed" })],
      edges: [],
    };
    const tasks = buildGap({
      docs: load(doc),
      exists: (p) => p === "src/done",
      graph: graph([]),
      previousSourcePaths: new Map(),
    });
    expect(tasks).toEqual([
      { type: "create-code", node: "new", path: "src/new" },
      { type: "finish", node: "done", path: "src/done" },
    ]);
  });

  it("separates imports across a removed edge from never-modelled ones", () => {
    const doc: Document = {
      version: "1.0",
      name: "x",
      nodes: [n("a", { sourcePath: "src/a" }), n("b", { sourcePath: "src/b" }), n("c", { sourcePath: "src/c" })],
      edges: [],
    };
    const tasks = buildGap({
      docs: load(doc),
      exists: () => true,
      graph: graph([["a", "b"], ["a", "c"]], ["a", "b", "c"]),
      previousSourcePaths: new Map(),
      previousEdges: new Set(["a\nb"]),
    });
    expect(tasks.map((t) => [t.type, (t as { to: string }).to])).toEqual([
      ["remove-import", "b"],
      ["undeclared-import", "c"],
    ]);
  });

  it("asks to remove an import the model does not allow, and to add a declared one", () => {
    const doc: Document = {
      version: "1.0",
      name: "x",
      nodes: [n("a", { sourcePath: "src/a" }), n("b", { sourcePath: "src/b" }), n("c", { sourcePath: "src/c" })],
      edges: [{ id: "a-c", from: "a", to: "c", relationship: "uses" }],
    };
    const tasks = buildGap({
      docs: load(doc),
      exists: () => true,
      graph: graph([["a", "b"]], ["a", "b", "c"]),
      previousSourcePaths: new Map(),
    });
    expect(tasks.map((t) => t.type)).toEqual(["add-dependency", "undeclared-import"]);
    expect(tasks[1]).toMatchObject({ from: "a", to: "b", evidence: [{ file: "src/a/x.ts" }] });
    expect(tasks[0]).toMatchObject({ edgeId: "a-c", from: "a", to: "c" });
  });

  it("treats an edge between containers as covering their children's imports", () => {
    const doc: Document = {
      version: "1.0",
      name: "x",
      nodes: [
        n("cli", { sourcePath: "src/cli" }),
        n("validate", { sourcePath: "src/cli/validate.ts", parentId: "cli" }),
        n("domain", { sourcePath: "src/domain" }),
      ],
      edges: [{ id: "c-d", from: "cli", to: "domain", relationship: "invokes" }],
    };
    const tasks = buildGap({
      docs: load(doc),
      exists: () => true,
      graph: graph([["validate", "domain"]], ["validate", "domain"]),
      previousSourcePaths: new Map(),
    });
    expect(tasks).toEqual([]);
  });

  it("reports imports that break the architecture style as style breaks", () => {
    const doc: Document = {
      version: "1.0",
      name: "x",
      style: { kind: "layered" },
      nodes: [
        n("web", { sourcePath: "src/web", layer: "presentation" }),
        n("db", { sourcePath: "src/db", layer: "infrastructure" }),
      ],
      edges: [{ id: "w-d", from: "web", to: "db", relationship: "uses" }],
    };
    const tasks = buildGap({
      docs: load(doc),
      exists: () => true,
      graph: graph([["web", "db"], ["db", "web"]], ["web", "db"]),
      previousSourcePaths: new Map(),
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ type: "style-break", from: "db", to: "web" });
    expect((tasks[0] as { message: string }).message).toContain("`db` (infrastructure) depends on `web` (presentation)");
  });
});
