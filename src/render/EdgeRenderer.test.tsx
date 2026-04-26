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
  labels: [],
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

  it("renders http_call as a dotted, animated edge (data on wire)", () => {
    const { container } = render(
      <svg>
        <EdgeRenderer edge={baseEdge({ relationship: "http_call" })} />
      </svg>,
    );
    const poly = container.querySelector(
      "polyline:not([data-archik-edge-hitarea])",
    );
    expect(poly?.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(poly?.getAttribute("class")).toContain("archik-edge-flowing");
  });

  it("uses one of the four shape markers per relationship", () => {
    const cases = [
      ["http_call", "archik-arrow-filled"],
      ["writes", "archik-arrow-filled"],
      ["reads", "archik-arrow-open"],
      ["publishes", "archik-arrow-circle"],
      ["subscribes", "archik-arrow-filled"],
      ["depends_on", "archik-arrow-open"],
      ["has_a", "archik-arrow-filled"],
      ["uses", "archik-arrow-open"],
    ] as const;
    for (const [rel, marker] of cases) {
      const { container, unmount } = render(
        <svg>
          <EdgeRenderer edge={baseEdge({ relationship: rel })} />
        </svg>,
      );
      const visiblePolyline = container.querySelector(
        "polyline:not([data-archik-edge-hitarea])",
      );
      expect(visiblePolyline?.getAttribute("marker-end")).toBe(
        `url(#${marker})`,
      );
      unmount();
    }
  });

  it("does not animate structural relationships", () => {
    for (const rel of ["depends_on", "implements", "has_a", "uses"] as const) {
      const { container, unmount } = render(
        <svg>
          <EdgeRenderer edge={baseEdge({ relationship: rel })} />
        </svg>,
      );
      const visiblePolyline = container.querySelector(
        "polyline:not([data-archik-edge-hitarea])",
      );
      expect(visiblePolyline?.getAttribute("class") ?? "").not.toContain(
        "archik-edge-flowing",
      );
      unmount();
    }
  });

  it("applies a per-edge color override when set", () => {
    const { container } = render(
      <svg>
        <EdgeRenderer edge={baseEdge({ color: "#f97316" })} />
      </svg>,
    );
    const visiblePolyline = container.querySelector(
      "polyline:not([data-archik-edge-hitarea])",
    );
    expect(visiblePolyline?.getAttribute("stroke")).toBe("#f97316");
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
    expect(onSelectEdge).toHaveBeenCalledTimes(1);
    expect(onSelectEdge.mock.calls[0]![0]).toBe("e1");
  });

  it("marks the wrapper as selected when its id is in selectedEdgeIds", () => {
    const { container } = render(
      <svg>
        <EdgeRenderer
          edge={baseEdge()}
          selectedEdgeIds={new Set(["e1"])}
        />
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
