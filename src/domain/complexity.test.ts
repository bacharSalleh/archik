import { describe, expect, it } from "vitest";
import { analyzeComplexity, DEFAULT_LIMITS } from "./complexity.ts";
import type { LoadedDoc } from "../io/discovery.ts";
import type { Document, Node, Edge } from "./types.ts";

function node(id: string, parentId?: string): Node {
  return {
    id,
    kind: "service",
    name: id,
    description: `does ${id}`,
    ...(parentId ? { parentId } : {}),
  } as Node;
}
function edge(id: string, from: string, to: string): Edge {
  return { id, from, to, relationship: "http_call" } as Edge;
}
function doc(relPath: string, nodes: Node[], edges: Edge[]): LoadedDoc {
  const d: Document = { version: "1.0", name: relPath, nodes, edges };
  return { doc: d, relPath } as LoadedDoc;
}

const TINY = { ...DEFAULT_LIMITS, maxNodes: 2, maxEdges: 2, maxChildren: 2, maxDegree: 2, maxDepth: 1 };

describe("analyzeComplexity", () => {
  it("returns nothing for a small model", () => {
    const docs = [doc("a.yaml", [node("x"), node("y")], [edge("e1", "x", "y")])];
    expect(analyzeComplexity(docs, DEFAULT_LIMITS)).toEqual([]);
  });

  it("flags a file with too many nodes", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const found = analyzeComplexity([doc("big.yaml", nodes, [])], TINY);
    const f = found.find((x) => x.kind === "file-nodes");
    expect(f).toBeDefined();
    expect(f!.subject).toBe("big.yaml");
    expect(f!.value).toBe(3);
    expect(f!.limit).toBe(2);
    expect(f!.suggestion).toContain("archikFile");
  });

  it("does not flag a file exactly at the node limit", () => {
    const nodes = [node("a"), node("b")];
    const found = analyzeComplexity([doc("ok.yaml", nodes, [])], TINY);
    expect(found.some((x) => x.kind === "file-nodes")).toBe(false);
  });

  it("flags a container with too many children", () => {
    const nodes = [node("p"), node("a", "p"), node("b", "p"), node("c", "p")];
    const found = analyzeComplexity([doc("c.yaml", nodes, [])], TINY);
    const f = found.find((x) => x.kind === "container-children");
    expect(f).toBeDefined();
    expect(f!.subject).toBe("p");
    expect(f!.value).toBe(3);
  });

  it("flags a high-degree hub counting in + out", () => {
    const nodes = [node("hub"), node("a"), node("b"), node("c")];
    const edges = [
      edge("e1", "hub", "a"),
      edge("e2", "hub", "b"),
      edge("e3", "c", "hub"),
    ];
    const found = analyzeComplexity([doc("h.yaml", nodes, edges)], TINY);
    const f = found.find((x) => x.kind === "node-degree");
    expect(f).toBeDefined();
    expect(f!.subject).toBe("hub");
    expect(f!.value).toBe(3);
  });

  it("flags nesting deeper than maxDepth", () => {
    const nodes = [node("g"), node("p", "g"), node("c", "p")]; // c has 2 ancestors
    const found = analyzeComplexity([doc("n.yaml", nodes, [])], TINY); // maxDepth 1
    const f = found.find((x) => x.kind === "nesting-depth");
    expect(f).toBeDefined();
    expect(f!.subject).toBe("c");
    expect(f!.value).toBe(2);
  });

  it("sorts worst overflow first", () => {
    const nodes = Array.from({ length: 6 }, (_, i) => node(`n${i}`));
    const edges = [edge("e1", "n0", "n1"), edge("e2", "n0", "n2"), edge("e3", "n0", "n3")];
    const found = analyzeComplexity([doc("w.yaml", nodes, edges)], TINY);
    // file-nodes overflow (6-2=4) should come before node-degree (3-2=1)
    expect(found[0]!.kind).toBe("file-nodes");
  });
});
