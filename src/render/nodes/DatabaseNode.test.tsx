import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DatabaseNode } from "./DatabaseNode.tsx";
import type { PositionedNode } from "../../layout/types.ts";

const dbNode: PositionedNode = {
  id: "db",
  kind: "database",
  name: "Orders DB",
  description: "test fixture",
  x: 0,
  y: 0,
  width: 140,
  height: 90,
  children: [],
};

describe("DatabaseNode", () => {
  it("shows the node name", () => {
    const { getByText } = render(
      <svg>
        <DatabaseNode node={dbNode} />
      </svg>,
    );
    expect(getByText("Orders DB")).toBeInTheDocument();
  });

  it("shows the DATABASE kind label", () => {
    const { container } = render(
      <svg>
        <DatabaseNode node={dbNode} />
      </svg>,
    );
    expect(container.textContent?.toUpperCase()).toContain("DATABASE");
  });
});
