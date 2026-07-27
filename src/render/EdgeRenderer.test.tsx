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

  it("renders an explicit arrowhead path at the edge end", () => {
    const { container } = render(
      <svg>
        <EdgeRenderer edge={baseEdge()} />
      </svg>,
    );
    const head = container.querySelector("[data-archik-arrowhead='end']");
    expect(head).not.toBeNull();
    expect(head?.getAttribute("d")).toBeTruthy();
  });

  it("renders uses as a solid, non-animated edge", () => {
    const { container } = render(
      <svg>
        <EdgeRenderer edge={baseEdge({ relationship: "uses" })} />
      </svg>,
    );
    const poly = container.querySelector(
      "polyline:not([data-archik-edge-hitarea])",
    );
    expect(poly?.getAttribute("stroke-dasharray")).toBeFalsy();
    expect(poly?.getAttribute("class") ?? "").not.toContain("archik-edge-flowing");
  });

  it("renders depends_on as dashed but not animated (UML dependency)", () => {
    const { container } = render(
      <svg>
        <EdgeRenderer edge={baseEdge({ relationship: "depends_on" })} />
      </svg>,
    );
    const poly = container.querySelector(
      "polyline:not([data-archik-edge-hitarea])",
    );
    expect(poly?.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(poly?.getAttribute("class") ?? "").not.toContain("archik-edge-flowing");
  });

  it("renders implements as dashed with a hollow triangle (UML realization)", () => {
    const { container } = render(
      <svg>
        <EdgeRenderer edge={baseEdge({ relationship: "implements" })} />
      </svg>,
    );
    const poly = container.querySelector(
      "polyline:not([data-archik-edge-hitarea])",
    );
    expect(poly?.getAttribute("stroke-dasharray")).toBeTruthy();
    const head = container.querySelector("[data-archik-arrowhead='end']");
    // Hollow UML triangle: panel fill + stroked outline.
    expect(head?.getAttribute("fill")).toBe("var(--archik-panel)");
    expect(head?.getAttribute("stroke")).toBeTruthy();
  });

  it("renders has_a with a composition diamond at the owner (start) end", () => {
    const { container } = render(
      <svg>
        <EdgeRenderer edge={baseEdge({ relationship: "has_a" })} />
      </svg>,
    );
    const diamond = container.querySelector("[data-archik-arrowhead='start']");
    expect(diamond).not.toBeNull();
    expect(diamond?.getAttribute("d")).toContain("Z"); // closed diamond polygon
  });

  it("renders http_call as a dashed, animated edge (data on wire)", () => {
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

  it("uses the right arrowhead shape per relationship", () => {
    // filled = solid head (fill only), open = chevron (stroke only),
    // triangle = hollow UML head (panel fill + stroke).
    const cases = [
      ["http_call", "filled"],
      ["writes", "filled"],
      ["reads", "open"],
      ["publishes", "filled"],
      ["subscribes", "filled"],
      ["depends_on", "open"],
      ["has_a", "open"],
      ["uses", "open"],
      ["implements", "triangle"],
      ["extends", "triangle"],
    ] as const;
    for (const [rel, kind] of cases) {
      const { container, unmount } = render(
        <svg>
          <EdgeRenderer edge={baseEdge({ relationship: rel })} />
        </svg>,
      );
      const head = container.querySelector("[data-archik-arrowhead='end']");
      expect(head, `head for ${rel}`).not.toBeNull();
      if (kind === "filled") {
        expect(head?.getAttribute("fill")).toBe("var(--archik-edge-filled)");
        expect(head?.getAttribute("stroke")).toBeNull();
      } else if (kind === "open") {
        expect(head?.getAttribute("fill")).toBe("none");
        expect(head?.getAttribute("stroke")).toBeTruthy();
      } else {
        expect(head?.getAttribute("fill")).toBe("var(--archik-panel)");
        expect(head?.getAttribute("stroke")).toBeTruthy();
      }
      unmount();
    }
  });

  it("does not animate structural or data-access relationships", () => {
    for (const rel of ["depends_on", "implements", "has_a", "uses", "reads", "writes", "publishes"] as const) {
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

  it("sets --archik-dash-period on animated wire edges", () => {
    const cases: Array<{ rel: PositionedEdge["relationship"]; period: string }> = [
      { rel: "http_call", period: "8" },   // "2 6"
      { rel: "grpc", period: "8" },         // "2 6"
      { rel: "websocket", period: "8" },    // "2 6"
      { rel: "webhook", period: "8" },      // "2 6"
    ];
    for (const { rel, period } of cases) {
      const { container, unmount } = render(
        <svg>
          <EdgeRenderer edge={baseEdge({ relationship: rel })} />
        </svg>,
      );
      const visiblePolyline = container.querySelector(
        "polyline:not([data-archik-edge-hitarea])",
      ) as SVGPolylineElement | null;
      const styleAttr = visiblePolyline?.getAttribute("style") ?? "";
      expect(styleAttr).toContain("--archik-dash-period");
      expect(styleAttr).toContain(period);
      unmount();
    }
  });

  it("does not set --archik-dash-period on non-animated edges", () => {
    const { container } = render(
      <svg>
        <EdgeRenderer edge={baseEdge({ relationship: "depends_on" })} />
      </svg>,
    );
    const visiblePolyline = container.querySelector(
      "polyline:not([data-archik-edge-hitarea])",
    );
    const styleAttr = visiblePolyline?.getAttribute("style") ?? "";
    expect(styleAttr).not.toContain("--archik-dash-period");
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
    expect(polylines.length).toBe(2);
    const hit = container.querySelector("[data-archik-edge-hitarea]");
    expect(hit).not.toBeNull();
  });
});
