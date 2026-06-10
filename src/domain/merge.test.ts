import { describe, expect, it } from "vitest";
import { mergeDocuments } from "./merge.ts";
import type { Document, Node } from "./types.ts";

const node = (id: string, extra: Partial<Node> = {}): Node => ({
  id,
  kind: "external",
  name: id.toUpperCase(),
  description: "x",
  ...extra,
});

const doc = (nodes: Node[], edges: Document["edges"] = []): Document => ({
  version: "1.0",
  name: "Demo",
  nodes,
  edges,
});

describe("mergeDocuments", () => {
  it("keeps additions from both sides", () => {
    const base = doc([node("api")]);
    const ours = doc([node("api"), node("worker")]);
    const theirs = doc([node("api"), node("db")]);
    const { doc: merged, conflicts } = mergeDocuments(base, ours, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.nodes.map((n) => n.id)).toEqual(["api", "worker", "db"]);
  });

  it("takes the only side that changed an entity", () => {
    const base = doc([node("api")]);
    const ours = doc([node("api")]);
    const theirs = doc([node("api", { description: "owns orders" })]);
    const { doc: merged, conflicts } = mergeDocuments(base, ours, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.nodes[0]!.description).toBe("owns orders");
  });

  it("merges different fields of the same entity field-wise", () => {
    const base = doc([node("api")]);
    const ours = doc([node("api", { description: "owns orders" })]);
    const theirs = doc([node("api", { stack: "node" })]);
    const { doc: merged, conflicts } = mergeDocuments(base, ours, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.nodes[0]!.description).toBe("owns orders");
    expect(merged.nodes[0]!.stack).toBe("node");
  });

  it("flags a conflict when both sides change the same field differently", () => {
    const base = doc([node("api")]);
    const ours = doc([node("api", { description: "ours" })]);
    const theirs = doc([node("api", { description: "theirs" })]);
    const { doc: merged, conflicts } = mergeDocuments(base, ours, theirs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      entity: "node",
      id: "api",
      field: "description",
    });
    // Ours wins in the output so the file stays self-consistent.
    expect(merged.nodes[0]!.description).toBe("ours");
  });

  it("applies an untouched-side deletion", () => {
    const base = doc([node("api"), node("legacy")]);
    const ours = doc([node("api")]); // we deleted legacy
    const theirs = doc([node("api"), node("legacy")]); // untouched
    const { doc: merged, conflicts } = mergeDocuments(base, ours, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.nodes.map((n) => n.id)).toEqual(["api"]);
  });

  it("flags modify-vs-delete and keeps the modified entity", () => {
    const base = doc([node("api"), node("legacy")]);
    const ours = doc([node("api")]); // we deleted legacy
    const theirs = doc([
      node("api"),
      node("legacy", { description: "still needed" }),
    ]);
    const { doc: merged, conflicts } = mergeDocuments(base, ours, theirs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.id).toBe("legacy");
    expect(merged.nodes.map((n) => n.id)).toEqual(["api", "legacy"]);
    expect(merged.nodes[1]!.description).toBe("still needed");
  });

  it("merges edges with the same rules", () => {
    const base = doc(
      [node("a"), node("b"), node("c")],
      [{ id: "ab", from: "a", to: "b", relationship: "invokes" }],
    );
    const ours = doc(
      [node("a"), node("b"), node("c")],
      [
        { id: "ab", from: "a", to: "b", relationship: "invokes" },
        { id: "ac", from: "a", to: "c", relationship: "reads" },
      ],
    );
    const theirs = doc(
      [node("a"), node("b"), node("c")],
      [{ id: "ab", from: "a", to: "b", relationship: "invokes", label: "go" }],
    );
    const { doc: merged, conflicts } = mergeDocuments(base, ours, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.edges.map((e) => e.id)).toEqual(["ab", "ac"]);
    expect(merged.edges[0]!.label).toBe("go");
  });

  it("merges document-level fields and flags name conflicts", () => {
    const base = doc([node("api")]);
    const ours = { ...doc([node("api")]), name: "Ours" };
    const theirs = { ...doc([node("api")]), name: "Theirs" };
    const { doc: merged, conflicts } = mergeDocuments(base, ours, theirs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ entity: "document", id: "name" });
    expect(merged.name).toBe("Ours");
  });

  it("preserves and merges document-level constraints", () => {
    const constraint = {
      id: "all-owned",
      description: "Everything has an owner.",
      requireOwner: {},
    };
    const base = doc([node("api", { owner: "t" })]);
    const ours = { ...doc([node("api", { owner: "t" })]), constraints: [constraint] };
    const theirs = doc([node("api", { owner: "t" })]);
    const { doc: merged, conflicts } = mergeDocuments(base, ours, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.constraints).toEqual([constraint]);
  });

  it("drops a field both sides removed", () => {
    const base = doc([node("api", { stack: "node" })]);
    const ours = doc([node("api")]);
    const theirs = doc([node("api")]);
    const { doc: merged, conflicts } = mergeDocuments(base, ours, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.nodes[0]!.stack).toBeUndefined();
    expect("stack" in merged.nodes[0]!).toBe(false);
  });
});
