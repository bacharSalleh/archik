import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CustomNode } from "./CustomNode.tsx";
import type { PositionedNode } from "../../layout/types.ts";

const node: PositionedNode = {
  id: "platform",
  kind: "custom",
  name: "Platform",
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  children: [],
};

describe("CustomNode", () => {
  it("renders the name", () => {
    const { getByText } = render(
      <svg>
        <CustomNode node={node} />
      </svg>,
    );
    expect(getByText("Platform")).toBeInTheDocument();
  });

  it("renders a plain rectangle (catch-all)", () => {
    const { container } = render(
      <svg>
        <CustomNode node={node} />
      </svg>,
    );
    expect(container.querySelector(".archik-node--custom rect")).not.toBeNull();
  });
});
