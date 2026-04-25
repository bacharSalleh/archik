import { describe, it, expect, vi } from "vitest";
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

  it("references an arrowhead marker via marker-end", () => {
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

  it("uses the async arrow marker for publishes/subscribes", () => {
    const pub = render(
      <svg>
        <EdgeRenderer edge={baseEdge({ relationship: "publishes" })} />
      </svg>,
    );
    const sub = render(
      <svg>
        <EdgeRenderer edge={baseEdge({ relationship: "subscribes" })} />
      </svg>,
    );
    expect(
      pub.container.querySelector("polyline")?.getAttribute("marker-end"),
    ).toBe("url(#archik-arrow-async)");
    expect(
      sub.container.querySelector("polyline")?.getAttribute("marker-end"),
    ).toBe("url(#archik-arrow-async)");
  });

  it("uses the dep arrow marker for depends_on", () => {
    const { container } = render(
      <svg>
        <EdgeRenderer edge={baseEdge({ relationship: "depends_on" })} />
      </svg>,
    );
    expect(
      container.querySelector("polyline")?.getAttribute("marker-end"),
    ).toBe("url(#archik-arrow-dep)");
  });

  it("draws writes thicker than reads", () => {
    const reads = render(
      <svg>
        <EdgeRenderer edge={baseEdge({ relationship: "reads" })} />
      </svg>,
    );
    const writes = render(
      <svg>
        <EdgeRenderer edge={baseEdge({ relationship: "writes" })} />
      </svg>,
    );
    const r = Number(
      reads.container.querySelector("polyline")?.getAttribute("stroke-width"),
    );
    const w = Number(
      writes.container.querySelector("polyline")?.getAttribute("stroke-width"),
    );
    expect(w).toBeGreaterThan(r);
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

  it("calls onSelectEdge with the edge id when clicked", () => {
    const onSelectEdge = vi.fn();
    const { container } = render(
      <svg>
        <EdgeRenderer edge={baseEdge()} onSelectEdge={onSelectEdge} />
      </svg>,
    );
    const wrapper = container.querySelector(
      "[data-archik-edge-id='e1']",
    ) as SVGGElement;
    wrapper.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSelectEdge).toHaveBeenCalledWith("e1");
  });

  it("marks the wrapper as selected when selectedEdgeId matches", () => {
    const { container } = render(
      <svg>
        <EdgeRenderer edge={baseEdge()} selectedEdgeId="e1" />
      </svg>,
    );
    expect(
      container
        .querySelector("[data-archik-edge-id='e1']")
        ?.getAttribute("data-archik-selected"),
    ).toBe("true");
  });

  it("includes a wide invisible hit area to make clicks easier", () => {
    const { container } = render(
      <svg>
        <EdgeRenderer edge={baseEdge()} onSelectEdge={vi.fn()} />
      </svg>,
    );
    const polylines = container.querySelectorAll("polyline");
    // visible + hit area
    expect(polylines.length).toBe(2);
    const hit = container.querySelector("[data-archik-edge-hitarea]");
    expect(hit).not.toBeNull();
  });
});
