import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { NodeRenderer } from "./NodeRenderer.tsx";
import type { PositionedNode } from "../layout/types.ts";

const make = (overrides: Partial<PositionedNode>): PositionedNode => ({
  id: "x",
  kind: "service",
  name: "X",
  x: 0,
  y: 0,
  width: 180,
  height: 80,
  children: [],
  ...overrides,
});

describe("NodeRenderer", () => {
  it("dispatches to ServiceNode for kind=service", () => {
    const { container } = render(
      <svg>
        <NodeRenderer node={make({ kind: "service", name: "Svc" })} />
      </svg>,
    );
    expect(container.querySelector(".archik-node--service")).not.toBeNull();
  });

  it("dispatches to DatabaseNode for kind=database", () => {
    const { container } = render(
      <svg>
        <NodeRenderer node={make({ kind: "database", name: "DB" })} />
      </svg>,
    );
    expect(container.querySelector(".archik-node--database")).not.toBeNull();
  });

  it("dispatches to QueueNode for kind=queue", () => {
    const { container } = render(
      <svg>
        <NodeRenderer node={make({ kind: "queue", name: "Q" })} />
      </svg>,
    );
    expect(container.querySelector(".archik-node--queue")).not.toBeNull();
  });

  it("translates the wrapper group by node x/y", () => {
    const { container } = render(
      <svg>
        <NodeRenderer node={make({ x: 100, y: 50 })} />
      </svg>,
    );
    const wrapper = container.querySelector("[data-archik-node-id='x']");
    expect(wrapper?.getAttribute("transform")).toBe("translate(100, 50)");
  });

  it("recurses into children", () => {
    const parent = make({
      id: "parent",
      kind: "custom",
      name: "Parent",
      width: 400,
      height: 200,
      children: [
        make({ id: "child-1", kind: "service", name: "Child 1", x: 20, y: 20 }),
        make({
          id: "child-2",
          kind: "database",
          name: "Child 2",
          x: 220,
          y: 20,
        }),
      ],
    });
    const { container } = render(
      <svg>
        <NodeRenderer node={parent} />
      </svg>,
    );
    expect(container.querySelector("[data-archik-node-id='child-1']")).not
      .toBeNull();
    expect(container.querySelector("[data-archik-node-id='child-2']")).not
      .toBeNull();
  });
});
