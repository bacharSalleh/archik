import { describe, it, expect } from "vitest";
import type { Document } from "./types.ts";
import type { LoadedDoc } from "../io/discovery.ts";
import {
  findNode,
  deps,
  dependents,
  listNodes,
  listEdges,
  stats,
  impact,
} from "./query.ts";

const mainDoc: Document = {
  version: "1.0",
  name: "Demo",
  nodes: [
    { id: "web", kind: "frontend", name: "Web", stack: "Next.js" },
    { id: "api", kind: "service", name: "API" },
    { id: "db", kind: "database", name: "Orders DB" },
    { id: "cache", kind: "cache", name: "Cache" },
    { id: "platform", kind: "module", name: "Platform" },
    { id: "worker", kind: "worker", name: "Worker", parentId: "platform" },
  ],
  edges: [
    { id: "web-api", from: "web", to: "api", relationship: "http_call" },
    { id: "api-db", from: "api", to: "db", relationship: "writes" },
    { id: "api-cache", from: "api", to: "cache", relationship: "reads" },
    { id: "worker-db", from: "worker", to: "db", relationship: "reads" },
  ],
};

const subDoc: Document = {
  version: "1.0",
  name: "Payments",
  nodes: [
    { id: "charge-handler", kind: "function", name: "Charge handler" },
  ],
  edges: [],
};

const docs: LoadedDoc[] = [
  { abs: "/p/.archik/main.archik.yaml", relPath: ".archik/main.archik.yaml", doc: mainDoc },
  { abs: "/p/.archik/payments.archik.yaml", relPath: ".archik/payments.archik.yaml", doc: subDoc },
];

describe("findNode", () => {
  it("finds a node and reports the file it lives in", () => {
    const result = findNode(docs, "api");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.found.node.id).toBe("api");
      expect(result.found.relPath).toBe(".archik/main.archik.yaml");
    }
  });

  it("finds a node in a sub-file", () => {
    const result = findNode(docs, "charge-handler");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.found.relPath).toBe(".archik/payments.archik.yaml");
    }
  });

  it("returns not-found for unknown id", () => {
    const result = findNode(docs, "ghost");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no node/i);
  });

  it("errors when an id appears in two files", () => {
    const collidingSub: Document = { ...subDoc, nodes: [{ id: "api", kind: "service", name: "Other API" }] };
    const collide: LoadedDoc[] = [
      docs[0]!,
      { ...docs[1]!, doc: collidingSub },
    ];
    const result = findNode(collide, "api");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/multiple files/i);
      expect(result.error).toContain(".archik/main.archik.yaml");
      expect(result.error).toContain(".archik/payments.archik.yaml");
    }
  });
});

describe("deps", () => {
  it("returns outgoing edges from a node", () => {
    const result = deps(docs, "api");
    expect(result.map((e) => e.edge.id).sort()).toEqual(["api-cache", "api-db"]);
  });

  it("returns empty for a node with no outgoing edges", () => {
    expect(deps(docs, "db")).toEqual([]);
  });
});

describe("dependents", () => {
  it("returns incoming edges to a node", () => {
    const result = dependents(docs, "db");
    expect(result.map((e) => e.edge.id).sort()).toEqual(["api-db", "worker-db"]);
  });

  it("returns empty for a leaf node with no inbound edges", () => {
    expect(dependents(docs, "web")).toEqual([]);
  });
});

describe("listNodes", () => {
  it("lists every node by default", () => {
    expect(listNodes(docs, {}).length).toBe(7);
  });

  it("filters by kind", () => {
    const result = listNodes(docs, { kind: "service" });
    expect(result.map((n) => n.node.id)).toEqual(["api"]);
  });

  it("filters by parentId", () => {
    const result = listNodes(docs, { parent: "platform" });
    expect(result.map((n) => n.node.id)).toEqual(["worker"]);
  });

  it("filters by file (basename match)", () => {
    const result = listNodes(docs, { file: "payments" });
    expect(result.map((n) => n.node.id)).toEqual(["charge-handler"]);
  });
});

describe("listEdges", () => {
  it("lists every edge by default", () => {
    expect(listEdges(docs, {}).length).toBe(4);
  });

  it("filters by from", () => {
    const result = listEdges(docs, { from: "api" });
    expect(result.map((e) => e.edge.id).sort()).toEqual(["api-cache", "api-db"]);
  });

  it("filters by to", () => {
    const result = listEdges(docs, { to: "db" });
    expect(result.map((e) => e.edge.id).sort()).toEqual(["api-db", "worker-db"]);
  });

  it("filters by relationship", () => {
    const result = listEdges(docs, { rel: "reads" });
    expect(result.map((e) => e.edge.id).sort()).toEqual(["api-cache", "worker-db"]);
  });
});

describe("stats", () => {
  it("counts nodes, edges, files, and kinds", () => {
    const s = stats(docs);
    expect(s.nodes).toBe(7);
    expect(s.edges).toBe(4);
    expect(s.files).toBe(2);
    expect(s.kinds.service).toBe(1);
    expect(s.kinds.frontend).toBe(1);
    expect(s.kinds.function).toBe(1);
  });
});

describe("impact", () => {
  it("reports edges that would dangle if a node were removed", () => {
    const result = impact(docs, "db");
    expect(result.danglingEdges.map((e) => e.edge.id).sort()).toEqual([
      "api-db",
      "worker-db",
    ]);
  });

  it("reports children that would orphan if a container were removed", () => {
    const result = impact(docs, "platform");
    expect(result.children.map((n) => n.node.id)).toEqual(["worker"]);
  });

  it("reports transitive dependents", () => {
    // db ← api ← web   (writes / reads via api)
    const result = impact(docs, "db");
    const ids = result.transitiveDependents.map((n) => n.node.id).sort();
    expect(ids).toContain("api");
    expect(ids).toContain("worker");
    expect(ids).toContain("web"); // reaches db via api
  });

  it("excludes the target itself from transitive dependents even when a cycle reaches it", () => {
    const cyclic: Document = {
      version: "1.0",
      name: "x",
      nodes: [
        { id: "a", kind: "service", name: "A" },
        { id: "b", kind: "service", name: "B" },
      ],
      edges: [
        { id: "a-b", from: "a", to: "b", relationship: "http_call" },
        { id: "b-a", from: "b", to: "a", relationship: "http_call" },
      ],
    };
    const cyclicDocs: LoadedDoc[] = [
      { abs: "/p/main.yaml", relPath: "main.yaml", doc: cyclic },
    ];
    const result = impact(cyclicDocs, "a");
    const ids = result.transitiveDependents.map((n) => n.node.id);
    expect(ids).toContain("b");
    expect(ids).not.toContain("a");
  });

  it("returns empty result for unknown id", () => {
    const result = impact(docs, "ghost");
    expect(result.danglingEdges).toEqual([]);
    expect(result.children).toEqual([]);
    expect(result.transitiveDependents).toEqual([]);
  });
});
