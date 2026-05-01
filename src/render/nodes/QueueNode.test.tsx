import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { QueueNode } from "./QueueNode.tsx";
import type { PositionedNode } from "../../layout/types.ts";

const node: PositionedNode = {
  id: "events",
  kind: "queue",
  name: "Order Events",
  description: "test fixture",
  x: 0,
  y: 0,
  width: 200,
  height: 60,
  children: [],
};

describe("QueueNode", () => {
  it("renders the name", () => {
    const { getByText } = render(
      <svg>
        <QueueNode node={node} />
      </svg>,
    );
    expect(getByText("Order Events")).toBeInTheDocument();
  });

  it("renders a capsule (high-radius rounded rect) with the queue marker class", () => {
    const { container } = render(
      <svg>
        <QueueNode node={node} />
      </svg>,
    );
    const wrapper = container.querySelector(".archik-node--queue");
    expect(wrapper).not.toBeNull();
    const rect = wrapper?.querySelector("rect");
    expect(rect).not.toBeNull();
    expect(Number(rect?.getAttribute("rx"))).toBeGreaterThanOrEqual(20);
  });
});
