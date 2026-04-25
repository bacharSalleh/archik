import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { GenericNode } from "./GenericNode.tsx";
import type { PositionedNode } from "../../layout/types.ts";

const node: PositionedNode = {
  id: "x",
  kind: "queue",
  name: "Events",
  x: 0,
  y: 0,
  width: 180,
  height: 60,
  children: [],
};

describe("GenericNode", () => {
  it("shows the node name and kind label", () => {
    const { getByText } = render(
      <svg>
        <GenericNode node={node} />
      </svg>,
    );
    expect(getByText("Events")).toBeInTheDocument();
    expect(getByText(/queue/i)).toBeInTheDocument();
  });
});
