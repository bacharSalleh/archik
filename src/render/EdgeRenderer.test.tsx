import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { EdgeRenderer } from "./EdgeRenderer.tsx";
import type { PositionedEdge } from "../layout/types.ts";

const baseEdge = (
  overrides: Partial<PositionedEdge> = {},
): PositionedEdge => ({
  id: "e1",
  from: "a",
  to: "b",
  relationship: "http_call",
  sections: [
    {
      startPoint: { x: 10, y: 10 },
      endPoint: { x: 100, y: 50 },
      bendPoints: [{ x: 60, y: 10 }],
    },
  ],
  ...overrides,
});

describe("EdgeRenderer", () => {
  it("renders a polyline through start, bends, and end", () => {
    const { container } = render(
      <svg>
        <EdgeRenderer edge={baseEdge()} />
      </svg>,
    );
    const poly = container.querySelector("polyline");
    expect(poly).not.toBeNull();
    const points = poly?.getAttribute("points") ?? "";
    expect(points).toContain("10,10");
    expect(points).toContain("60,10");
    expect(points).toContain("100,50");
  });

  it("references the shared arrowhead marker via marker-end", () => {
    const { container } = render(
      <svg>
        <EdgeRenderer edge={baseEdge()} />
      </svg>,
    );
    const poly = container.querySelector("polyline");
    expect(poly?.getAttribute("marker-end")).toMatch(/^url\(#archik-arrow/);
  });

  it("uses dashed stroke for depends_on relationships", () => {
    const { container } = render(
      <svg>
        <EdgeRenderer edge={baseEdge({ relationship: "depends_on" })} />
      </svg>,
    );
    const poly = container.querySelector("polyline");
    expect(poly?.getAttribute("stroke-dasharray")).toBeTruthy();
  });

  it("uses solid stroke for http_call", () => {
    const { container } = render(
      <svg>
        <EdgeRenderer edge={baseEdge({ relationship: "http_call" })} />
      </svg>,
    );
    const poly = container.querySelector("polyline");
    expect(poly?.getAttribute("stroke-dasharray")).toBeFalsy();
  });

  it("renders nothing visible when sections is empty (defensive)", () => {
    const { container } = render(
      <svg>
        <EdgeRenderer edge={baseEdge({ sections: [] })} />
      </svg>,
    );
    expect(container.querySelector("polyline")).toBeNull();
  });

  it("renders a label when one is provided", () => {
    const { getByText } = render(
      <svg>
        <EdgeRenderer edge={baseEdge({ label: "writes" })} />
      </svg>,
    );
    expect(getByText("writes")).toBeInTheDocument();
  });
});
