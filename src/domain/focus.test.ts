import { describe, expect, it } from "vitest";
import {
  applyEdgeView,
  collapseContainers,
  neighborIds,
  projectCanvasView,
  subgraphDoc,
} from "./focus.ts";
import type { Document, Node, Edge } from "./types.ts";

function n(id: string, parentId?: string): Node {
  return { id, kind: "service", name: id, description: `does ${id}`, ...(parentId ? { parentId } : {}) } as Node;
}
function e(id: string, from: string, to: string, rel: string = "http_call"): Edge {
  return { id, from, to, relationship: rel } as Edge;
}
function d(nodes: Node[], edges: Edge[]): Document {
  return { version: "1.0", name: "t", nodes, edges };
}

describe("neighborIds", () => {
  const edges = [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
    { from: "x", to: "a" },
  ];
  it("depth 0 is just the node", () => {
    expect([...neighborIds(edges, "a", 0)]).toEqual(["a"]);
  });
  it("depth 1 includes both-direction neighbors", () => {
    expect(new Set(neighborIds(edges, "a", 1))).toEqual(new Set(["a", "b", "x"]));
  });
  it("depth 2 reaches two hops", () => {
    expect(new Set(neighborIds(edges, "a", 2))).toEqual(new Set(["a", "b", "x", "c"]));
  });
});

describe("subgraphDoc", () => {
  it("keeps only nodes in the neighborhood and edges among them", () => {
    const doc = d([n("a"), n("b"), n("c"), n("z")], [e("e1", "a", "b"), e("e2", "b", "c"), e("e3", "z", "z" )]);
    const sub = subgraphDoc(doc, "a", 1);
    expect(new Set(sub.nodes.map((x) => x.id))).toEqual(new Set(["a", "b"]));
    expect(sub.edges.map((x) => x.id)).toEqual(["e1"]);
  });

  it("orphans parentId pointing outside the kept set (avoids dangling container)", () => {
    // 'child' lives in container 'p'; focus on 'ext' (a neighbour of
    // 'child') keeps 'child' but NOT 'p'. The kept child must lose its
    // parentId so layout doesn't reference a missing container.
    const doc = d(
      [n("p"), n("child", "p"), n("ext")],
      [e("e1", "ext", "child")],
    );
    const sub = subgraphDoc(doc, "ext", 1);
    expect(new Set(sub.nodes.map((x) => x.id))).toEqual(new Set(["ext", "child"]));
    const child = sub.nodes.find((x) => x.id === "child")!;
    expect(child.parentId).toBeUndefined();
  });

  it("keeps parentId when the parent is also in the kept set", () => {
    // focus on 'p' depth 1 keeps both 'p' and its child 'child'
    // (connected by an edge), so the parent link stays intact.
    const doc = d([n("p"), n("child", "p")], [e("e1", "p", "child")]);
    const sub = subgraphDoc(doc, "p", 1);
    const child = sub.nodes.find((x) => x.id === "child")!;
    expect(child.parentId).toBe("p");
  });
});

describe("applyEdgeView", () => {
  const doc = d([n("a"), n("b")], [e("e1", "a", "b", "http_call"), e("e2", "a", "b", "uses")]);
  it("hideStructural drops structural edges", () => {
    expect(applyEdgeView(doc, { hideStructural: true }).edges.map((x) => x.id)).toEqual(["e1"]);
  });
  it("onlyRel keeps only the listed relationships", () => {
    expect(applyEdgeView(doc, { onlyRel: ["uses"] }).edges.map((x) => x.id)).toEqual(["e2"]);
  });
  it("hideRel drops the listed relationships", () => {
    expect(applyEdgeView(doc, { hideRel: ["http_call"] }).edges.map((x) => x.id)).toEqual(["e2"]);
  });
});

describe("collapseContainers", () => {
  it("hides children and re-points + dedups their edges to the container", () => {
    const doc = d(
      [n("p"), n("a", "p"), n("b", "p"), n("ext")],
      [e("e1", "ext", "a"), e("e2", "ext", "b")],
    );
    const out = collapseContainers(doc, new Set(["p"]));
    expect(new Set(out.nodes.map((x) => x.id))).toEqual(new Set(["p", "ext"]));
    // both ext->a and ext->b collapse to a single ext->p
    const reEdges = out.edges.filter((x) => x.from === "ext" && x.to === "p");
    expect(reEdges.length).toBe(1);
  });
  it("drops edges that become self-loops after collapse", () => {
    const doc = d([n("p"), n("a", "p"), n("b", "p")], [e("e1", "a", "b")]);
    const out = collapseContainers(doc, new Set(["p"]));
    expect(out.edges.length).toBe(0);
  });
});

describe("projectCanvasView", () => {
  it("composes collapse, focus, and hideStructural", () => {
    const doc = d(
      [n("a"), n("b"), n("z")],
      [e("e1", "a", "b", "http_call"), e("e2", "a", "b", "uses"), e("e3", "b", "z")],
    );
    const out = projectCanvasView(doc, { collapsed: new Set(), hideStructural: true, focus: { id: "a", depth: 1 } });
    expect(new Set(out.nodes.map((x) => x.id))).toEqual(new Set(["a", "b"]));
    expect(out.edges.map((x) => x.id)).toEqual(["e1"]); // e2 hidden (structural), e3 out of focus
  });
});
