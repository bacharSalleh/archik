import { describe, it, expect } from "vitest";
import type { Document } from "./types.ts";
import { diffDocuments, mergeForDiff, statusMap } from "./diff.ts";

const baseline: Document = {
  version: "1.0",
  name: "Demo",
  nodes: [
    { id: "web", kind: "frontend", name: "Web", stack: "Next.js" },
    { id: "api", kind: "service", name: "API", stack: "Go 1.20" },
    { id: "db", kind: "database", name: "DB" },
    { id: "cache", kind: "cache", name: "Cache" },
  ],
  edges: [
    { id: "web-api", from: "web", to: "api", relationship: "http_call" },
    { id: "api-db", from: "api", to: "db", relationship: "writes" },
    { id: "api-cache", from: "api", to: "cache", relationship: "reads" },
  ],
};

const next: Document = {
  version: "1.0",
  name: "Demo",
  nodes: [
    { id: "web", kind: "frontend", name: "Web", stack: "Next.js" }, // unchanged
    { id: "api", kind: "service", name: "API", stack: "Go 1.22" }, // changed (stack)
    { id: "db", kind: "database", name: "DB" }, // unchanged
    { id: "worker", kind: "worker", name: "Worker" }, // added
    // cache removed
  ],
  edges: [
    { id: "web-api", from: "web", to: "api", relationship: "http_call" }, // unchanged
    { id: "api-db", from: "api", to: "db", relationship: "writes" }, // unchanged
    { id: "worker-db", from: "worker", to: "db", relationship: "reads" }, // added
    // api-cache removed
  ],
};

describe("diffDocuments", () => {
  const diff = diffDocuments(baseline, next);

  it("counts added nodes", () => {
    expect(diff.nodes.added.map((n) => n.id)).toEqual(["worker"]);
  });

  it("counts removed nodes", () => {
    expect(diff.nodes.removed.map((n) => n.id)).toEqual(["cache"]);
  });

  it("counts changed nodes with the field that changed", () => {
    expect(diff.nodes.changed).toHaveLength(1);
    const change = diff.nodes.changed[0]!;
    expect(change.node.id).toBe("api");
    expect(change.changes).toEqual([
      { field: "stack", before: "Go 1.20", after: "Go 1.22" },
    ]);
  });

  it("counts unchanged nodes", () => {
    expect(diff.nodes.unchanged).toEqual(["web", "db"]);
  });

  it("counts added/removed edges", () => {
    expect(diff.edges.added.map((e) => e.id)).toEqual(["worker-db"]);
    expect(diff.edges.removed.map((e) => e.id)).toEqual(["api-cache"]);
  });

  it("doesn't double-count an unchanged document", () => {
    const same = diffDocuments(baseline, baseline);
    expect(same.nodes.added).toHaveLength(0);
    expect(same.nodes.removed).toHaveLength(0);
    expect(same.nodes.changed).toHaveLength(0);
    expect(same.edges.added).toHaveLength(0);
    expect(same.edges.removed).toHaveLength(0);
    expect(same.edges.changed).toHaveLength(0);
    expect(same.nodes.unchanged.length).toBe(baseline.nodes.length);
  });

  it("notices array-field changes (responsibilities)", () => {
    const a: Document = {
      ...baseline,
      nodes: [
        { id: "x", kind: "service", name: "X", responsibilities: ["a", "b"] },
      ],
      edges: [],
    };
    const b: Document = {
      ...baseline,
      nodes: [
        { id: "x", kind: "service", name: "X", responsibilities: ["a", "b", "c"] },
      ],
      edges: [],
    };
    const d = diffDocuments(a, b);
    expect(d.nodes.changed).toHaveLength(1);
    expect(d.nodes.changed[0]!.changes[0]!.field).toBe("responsibilities");
  });
});

describe("statusMap", () => {
  it("indexes every entity by status", () => {
    const map = statusMap(diffDocuments(baseline, next));
    expect(map.nodes.get("worker")).toBe("added");
    expect(map.nodes.get("cache")).toBe("removed");
    expect(map.nodes.get("api")).toBe("changed");
    expect(map.nodes.get("web")).toBe("unchanged");
    expect(map.edges.get("worker-db")).toBe("added");
    expect(map.edges.get("api-cache")).toBe("removed");
  });
});

describe("mergeForDiff", () => {
  const merged = mergeForDiff(baseline, next);

  it("contains every node from both documents", () => {
    const ids = merged.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["api", "cache", "db", "web", "worker"]);
  });

  it("contains every edge from both documents", () => {
    const ids = merged.edges.map((e) => e.id).sort();
    expect(ids).toEqual(["api-cache", "api-db", "web-api", "worker-db"]);
  });

  it("uses after's data when an id is in both", () => {
    const api = merged.nodes.find((n) => n.id === "api")!;
    expect(api.stack).toBe("Go 1.22");
  });

  it("strips a removed node's parentId when the parent isn't in the merge", () => {
    const a: Document = {
      version: "1.0",
      name: "x",
      nodes: [
        { id: "container", kind: "module", name: "Container" },
        { id: "child", kind: "service", name: "Child", parentId: "container" },
      ],
      edges: [],
    };
    const b: Document = { version: "1.0", name: "x", nodes: [], edges: [] };
    const m = mergeForDiff(a, b);
    const child = m.nodes.find((n) => n.id === "child")!;
    // both removed, both in merge → parentId preserved
    expect(child.parentId).toBe("container");
  });
});
