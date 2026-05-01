import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ExternalNode } from "./ExternalNode.tsx";
import type { PositionedNode } from "../../layout/types.ts";

const node: PositionedNode = {
  id: "stripe",
  kind: "external",
  name: "Stripe",
  description: "test fixture",
  x: 0,
  y: 0,
  width: 160,
  height: 70,
  children: [],
};

describe("ExternalNode", () => {
  it("renders the name", () => {
    const { getByText } = render(
      <svg>
        <ExternalNode node={node} />
      </svg>,
    );
    expect(getByText("Stripe")).toBeInTheDocument();
  });

  it("uses a dashed border to convey 'outside the system'", () => {
    const { container } = render(
      <svg>
        <ExternalNode node={node} />
      </svg>,
    );
    const wrapper = container.querySelector(".archik-node--external");
    expect(wrapper).not.toBeNull();
    const rect = wrapper?.querySelector("rect");
    expect(rect?.getAttribute("stroke-dasharray")).toBeTruthy();
  });
});
