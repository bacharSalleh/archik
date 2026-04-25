import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CacheNode } from "./CacheNode.tsx";
import type { PositionedNode } from "../../layout/types.ts";

const node: PositionedNode = {
  id: "cache",
  kind: "cache",
  name: "Order Cache",
  x: 0,
  y: 0,
  width: 140,
  height: 80,
  children: [],
};

describe("CacheNode", () => {
  it("renders the name", () => {
    const { getByText } = render(
      <svg>
        <CacheNode node={node} />
      </svg>,
    );
    expect(getByText("Order Cache")).toBeInTheDocument();
  });

  it("renders the cache marker class", () => {
    const { container } = render(
      <svg>
        <CacheNode node={node} />
      </svg>,
    );
    expect(container.querySelector(".archik-node--cache")).not.toBeNull();
  });
});
