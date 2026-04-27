import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CustomNode } from "./CustomNode.tsx";
import type { PositionedNode } from "../../layout/types.ts";

const empty: PositionedNode = {
  id: "platform",
  kind: "custom",
  name: "Platform",
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  children: [],
};

const populated: PositionedNode = {
  ...empty,
  width: 320,
  height: 200,
  children: [
    {
      id: "api",
      kind: "service",
      name: "API",
      x: 20,
      y: 60,
      width: 140,
      height: 80,
      children: [],
    },
  ],
};

describe("CustomNode", () => {
  it("renders the name as a placeholder when empty", () => {
    const { getByText, container } = render(
      <svg>
        <CustomNode node={empty} />
      </svg>,
    );
    expect(getByText("Platform")).toBeInTheDocument();
    expect(container.querySelector(".archik-node--custom rect")).not.toBeNull();
  });

  it("renders a header bar with kind tag once it has children", () => {
    const { getByText, container } = render(
      <svg>
        <CustomNode node={populated} />
      </svg>,
    );
    expect(getByText("Platform")).toBeInTheDocument();
    expect(getByText("CUSTOM")).toBeInTheDocument();
    expect(
      container.querySelector(".archik-node--container"),
    ).not.toBeNull();
  });

  it("deepens the background tint as nesting depth grows", () => {
    const opacityAt = (depth: number): number => {
      const { container } = render(
        <svg>
          <CustomNode node={populated} depth={depth} />
        </svg>,
      );
      return parseFloat(
        container.querySelector("rect")?.getAttribute("fill-opacity") ?? "0",
      );
    };
    // Step between consecutive levels must be large enough that two
    // same-kind containers nested in each other read as distinct.
    expect(opacityAt(1) - opacityAt(0)).toBeGreaterThanOrEqual(0.05);
    expect(opacityAt(2)).toBeGreaterThan(opacityAt(0));
  });

  it("draws an elevation stroke at depth >= 1 and skips it at depth 0", () => {
    const insetAt = (depth: number): SVGRectElement | null => {
      const { container } = render(
        <svg>
          <CustomNode node={populated} depth={depth} />
        </svg>,
      );
      return container.querySelector('rect[x="3"][y="3"][fill="none"]');
    };
    expect(insetAt(0)).toBeNull();
    expect(insetAt(1)).not.toBeNull();
    expect(insetAt(2)).not.toBeNull();
  });
});
