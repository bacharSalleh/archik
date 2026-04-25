import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FrontendNode } from "./FrontendNode.tsx";
import type { PositionedNode } from "../../layout/types.ts";

const node: PositionedNode = {
  id: "web",
  kind: "frontend",
  name: "Web",
  x: 0,
  y: 0,
  width: 180,
  height: 80,
  children: [],
};

describe("FrontendNode", () => {
  it("renders the name", () => {
    const { getByText } = render(
      <svg>
        <FrontendNode node={node} />
      </svg>,
    );
    expect(getByText("Web")).toBeInTheDocument();
  });

  it("shows the FRONTEND kind label", () => {
    const { container } = render(
      <svg>
        <FrontendNode node={node} />
      </svg>,
    );
    expect(container.textContent?.toUpperCase()).toContain("FRONTEND");
  });
});
