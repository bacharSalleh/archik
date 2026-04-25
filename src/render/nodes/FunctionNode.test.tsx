import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FunctionNode } from "./FunctionNode.tsx";
import type { PositionedNode } from "../../layout/types.ts";

const node: PositionedNode = {
  id: "fn",
  kind: "function",
  name: "Resize Image",
  x: 0,
  y: 0,
  width: 180,
  height: 60,
  children: [],
};

describe("FunctionNode", () => {
  it("renders the name", () => {
    const { getByText } = render(
      <svg>
        <FunctionNode node={node} />
      </svg>,
    );
    expect(getByText("Resize Image")).toBeInTheDocument();
  });

  it("shows the FUNCTION kind label", () => {
    const { container } = render(
      <svg>
        <FunctionNode node={node} />
      </svg>,
    );
    expect(container.textContent?.toUpperCase()).toContain("FUNCTION");
  });
});
