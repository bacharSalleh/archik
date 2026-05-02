import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CompactNode } from "./CompactNode.tsx";
import type { PositionedNode } from "../../layout/types.ts";

function makeNode(
  overrides: Partial<PositionedNode> = {},
): PositionedNode {
  return {
    id: "api",
    kind: "service",
    name: "API",
    description: "test fixture",
    x: 0,
    y: 0,
    width: 140,
    height: 30,
    children: [],
    ...overrides,
  };
}

describe("CompactNode", () => {
  it("renders without crashing for a leaf node", () => {
    const { container } = render(
      <svg>
        <CompactNode node={makeNode()} />
      </svg>,
    );
    expect(container.querySelector("g.archik-node")).not.toBeNull();
  });

  it("leaf node has archik-node--compact class", () => {
    const { container } = render(
      <svg>
        <CompactNode node={makeNode()} />
      </svg>,
    );
    expect(
      container.querySelector(".archik-node--compact"),
    ).not.toBeNull();
  });

  it("container node (has children) renders archik-node--container class", () => {
    const child = makeNode({ id: "child", x: 0, y: 0 });
    const parent = makeNode({ id: "parent", children: [child], width: 300, height: 200 });
    const { container } = render(
      <svg>
        <CompactNode node={parent} />
      </svg>,
    );
    expect(container.querySelector(".archik-node--container")).not.toBeNull();
  });

  it("selected leaf adds archik-selected-glow class to its rect", () => {
    const { container } = render(
      <svg>
        <CompactNode node={makeNode()} selected />
      </svg>,
    );
    expect(container.querySelector("rect.archik-selected-glow")).not.toBeNull();
  });

  it("renders the node name as text", () => {
    const { container } = render(
      <svg>
        <CompactNode node={makeNode({ name: "Orders" })} />
      </svg>,
    );
    const text = container.querySelector("text");
    expect(text?.textContent).toContain("Orders");
  });
});
