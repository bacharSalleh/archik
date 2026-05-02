import { describe, expect, it } from "vitest";
import { flattenAbsoluteNodes } from "./diffOverlay.tsx";
import type { PositionedNode } from "../layout/types.ts";

function makeNode(
  id: string,
  x: number,
  y: number,
  children: PositionedNode[] = [],
): PositionedNode {
  return {
    id,
    kind: "service",
    name: id,
    description: "test fixture",
    x,
    y,
    width: 100,
    height: 50,
    children,
  };
}

describe("flattenAbsoluteNodes", () => {
  it("returns an empty array for an empty roots list", () => {
    expect(flattenAbsoluteNodes([])).toHaveLength(0);
  });

  it("maps flat roots to absolute positions equal to their own x/y", () => {
    const nodes = [makeNode("a", 10, 20), makeNode("b", 30, 40)];
    const result = flattenAbsoluteNodes(nodes);
    expect(result).toHaveLength(2);
    expect(result.find((n) => n.id === "a")).toMatchObject({ absX: 10, absY: 20 });
    expect(result.find((n) => n.id === "b")).toMatchObject({ absX: 30, absY: 40 });
  });

  it("adds parent offset to child absolute positions", () => {
    const child = makeNode("child", 5, 8);
    const parent = makeNode("parent", 100, 200, [child]);
    const result = flattenAbsoluteNodes([parent]);
    const childResult = result.find((n) => n.id === "child");
    expect(childResult).toMatchObject({ absX: 105, absY: 208 });
  });

  it("accumulates offsets through multiple levels of nesting", () => {
    const grandchild = makeNode("gc", 1, 2);
    const child = makeNode("c", 10, 20, [grandchild]);
    const root = makeNode("r", 100, 200, [child]);
    const result = flattenAbsoluteNodes([root]);
    const gcResult = result.find((n) => n.id === "gc");
    expect(gcResult).toMatchObject({ absX: 111, absY: 222 });
  });

  it("includes both parent and child in the output", () => {
    const child = makeNode("child", 5, 5);
    const parent = makeNode("parent", 0, 0, [child]);
    const result = flattenAbsoluteNodes([parent]);
    expect(result.map((n) => n.id)).toEqual(["parent", "child"]);
  });

  it("preserves all original node fields alongside the abs coords", () => {
    const node = makeNode("api", 10, 10);
    const result = flattenAbsoluteNodes([node]);
    expect(result[0]).toMatchObject({
      id: "api",
      kind: "service",
      width: 100,
      height: 50,
    });
  });
});
