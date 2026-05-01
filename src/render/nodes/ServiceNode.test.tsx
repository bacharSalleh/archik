import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ServiceNode } from "./ServiceNode.tsx";
import type { PositionedNode } from "../../layout/types.ts";

const positioned = (overrides: Partial<PositionedNode> = {}): PositionedNode => ({
  id: "api",
  kind: "service",
  name: "Orders API",
  description: "test fixture",
  x: 0,
  y: 0,
  width: 180,
  height: 80,
  children: [],
  ...overrides,
});

describe("ServiceNode", () => {
  it("shows the node name", () => {
    const { getByText } = render(
      <svg>
        <ServiceNode node={positioned()} />
      </svg>,
    );
    expect(getByText("Orders API")).toBeInTheDocument();
  });

  it("shows the stack when present", () => {
    const { getByText } = render(
      <svg>
        <ServiceNode node={positioned({ stack: "Go" })} />
      </svg>,
    );
    expect(getByText("Go")).toBeInTheDocument();
  });

  it("draws a rectangle sized to the node's width/height", () => {
    const { container } = render(
      <svg>
        <ServiceNode node={positioned({ width: 200, height: 90 })} />
      </svg>,
    );
    const rect = container.querySelector("rect");
    expect(rect).not.toBeNull();
    expect(rect?.getAttribute("width")).toBe("200");
    expect(rect?.getAttribute("height")).toBe("90");
  });
});
