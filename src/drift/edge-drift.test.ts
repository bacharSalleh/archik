import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildImportGraph,
  checkEdgeDrift,
  extractSpecifiers,
} from "./edge-drift.ts";
import type { Document, Node } from "../domain/types.ts";

describe("extractSpecifiers", () => {
  it("finds static, side-effect, re-export, require, and dynamic imports", () => {
    const src = [
      'import { a } from "./a.ts";',
      'import "./side-effect.ts";',
      'import * as ns from "../ns/index.ts";',
      'export { b } from "./b.ts";',
      'const c = require("./c.cjs");',
      'const d = await import("./d.mjs");',
    ].join("\n");
    expect(extractSpecifiers(src).sort()).toEqual([
      "../ns/index.ts",
      "./a.ts",
      "./b.ts",
      "./c.cjs",
      "./d.mjs",
      "./side-effect.ts",
    ]);
  });

  it("ignores imports inside comments", () => {
    const src = [
      "// import { x } from \"./commented.ts\";",
      "/* import { y } from './blocked.ts'; */",
      'import { real } from "./real.ts";',
    ].join("\n");
    expect(extractSpecifiers(src)).toEqual(["./real.ts"]);
  });

  it("dedupes repeated specifiers", () => {
    const src = 'import { a } from "./a.ts";\nimport { b } from "./a.ts";';
    expect(extractSpecifiers(src)).toEqual(["./a.ts"]);
  });
});

describe("buildImportGraph + checkEdgeDrift", () => {
  let root: string;

  const node = (id: string, sourcePath: string, extra: Partial<Node> = {}): Node => ({
    id,
    kind: "module",
    name: id,
    description: "x",
    sourcePath,
    ...extra,
  });

  const doc = (nodes: Node[], edges: Document["edges"]): Document => ({
    version: "1.0",
    name: "Demo",
    nodes,
    edges,
  });

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "archik-edge-drift-"));
    await mkdir(path.join(root, "src/orders"), { recursive: true });
    await mkdir(path.join(root, "src/billing"), { recursive: true });
    await mkdir(path.join(root, "src/shared"), { recursive: true });
    await writeFile(
      path.join(root, "src/orders/api.ts"),
      'import { charge } from "../billing/charge.ts";\nimport { log } from "../shared/log.ts";\nexport const place = () => charge(log);\n',
    );
    await writeFile(
      path.join(root, "src/billing/charge.ts"),
      "export const charge = (x: unknown) => x;\n",
    );
    await writeFile(
      path.join(root, "src/shared/log.ts"),
      "export const log = 1;\n",
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const nodes = (): Node[] => [
    node("orders", "src/orders"),
    node("billing", "src/billing"),
    node("shared", "src/shared"),
  ];

  it("builds import pairs with evidence", async () => {
    const graph = await buildImportGraph(nodes(), root);
    const keys = graph.pairs.map((p) => `${p.from}->${p.to}`).sort();
    expect(keys).toEqual(["orders->billing", "orders->shared"]);
    const pair = graph.pairs.find((p) => p.to === "billing")!;
    expect(pair.evidence[0]).toEqual({
      file: "src/orders/api.ts",
      specifier: "../billing/charge.ts",
    });
    expect([...graph.scannable].sort()).toEqual(["billing", "orders", "shared"]);
  });

  it("reports shadow edges for undeclared import pairs", async () => {
    const graph = await buildImportGraph(nodes(), root);
    const d = doc(nodes(), [
      { id: "o-b", from: "orders", to: "billing", relationship: "uses" },
      // orders → shared NOT declared
    ]);
    const result = checkEdgeDrift(d, graph);
    expect(result.shadow).toHaveLength(1);
    expect(result.shadow[0]).toMatchObject({ from: "orders", to: "shared" });
    expect(result.phantom).toHaveLength(0);
  });

  it("treats a reverse-direction edge as covering the pair", async () => {
    const graph = await buildImportGraph(nodes(), root);
    const d = doc(nodes(), [
      { id: "o-b", from: "orders", to: "billing", relationship: "uses" },
      // declared opposite to the import direction — still covered
      { id: "s-o", from: "shared", to: "orders", relationship: "uses" },
    ]);
    expect(checkEdgeDrift(d, graph).shadow).toHaveLength(0);
  });

  it("skips ancestry pairs", async () => {
    const all = [
      node("orders", "src/orders"),
      node("orders-api", "src/orders/api.ts", { kind: "function", parentId: "orders" }),
      node("billing", "src/billing"),
    ];
    const graph = await buildImportGraph(all, root);
    const d = doc(all, [
      { id: "oa-b", from: "orders-api", to: "billing", relationship: "uses" },
    ]);
    const result = checkEdgeDrift(d, graph);
    // orders ↔ orders-api never appears even though the file sits
    // inside both sourcePaths; orders-api → billing is declared.
    expect(result.shadow).toHaveLength(0);
  });

  it("attributes files to the deepest owning node", async () => {
    const all = [
      node("orders", "src/orders"),
      node("orders-api", "src/orders/api.ts", { kind: "function", parentId: "orders" }),
      node("billing", "src/billing"),
      node("shared", "src/shared"),
    ];
    const graph = await buildImportGraph(all, root);
    const froms = new Set(graph.pairs.map((p) => p.from));
    expect(froms.has("orders-api")).toBe(true);
    expect(froms.has("orders")).toBe(false);
  });

  it("reports phantom structural edges with no import either way", async () => {
    const graph = await buildImportGraph(nodes(), root);
    const d = doc(nodes(), [
      { id: "o-b", from: "orders", to: "billing", relationship: "uses" },
      { id: "o-s", from: "orders", to: "shared", relationship: "uses" },
      { id: "b-s", from: "billing", to: "shared", relationship: "depends_on" }, // phantom
    ]);
    const result = checkEdgeDrift(d, graph);
    expect(result.phantom).toHaveLength(1);
    expect(result.phantom[0]).toMatchObject({ edgeId: "b-s" });
  });

  it("exempts wire relationships and non-scannable nodes from phantom checks", async () => {
    await mkdir(path.join(root, "assets"), { recursive: true });
    await writeFile(path.join(root, "assets/logo.svg"), "<svg/>");
    const all = [...nodes(), node("assets", "assets")];
    const graph = await buildImportGraph(all, root);
    const d = doc(all, [
      { id: "o-b", from: "orders", to: "billing", relationship: "uses" },
      { id: "o-s", from: "orders", to: "shared", relationship: "uses" },
      // http_call is a wire relationship — never phantom-checked.
      { id: "b-o", from: "billing", to: "orders", relationship: "http_call" },
      // assets has no scannable files — exempt.
      { id: "s-a", from: "shared", to: "assets", relationship: "uses" },
    ]);
    const result = checkEdgeDrift(d, graph);
    expect(result.phantom).toHaveLength(0);
  });

  it("skips proposed edges in phantom checks", async () => {
    const graph = await buildImportGraph(nodes(), root);
    const d = doc(nodes(), [
      { id: "o-b", from: "orders", to: "billing", relationship: "uses" },
      { id: "o-s", from: "orders", to: "shared", relationship: "uses" },
      { id: "b-s", from: "billing", to: "shared", relationship: "uses", status: "proposed" },
    ]);
    expect(checkEdgeDrift(d, graph).phantom).toHaveLength(0);
  });
});
