import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { NodeRenderer } from "./NodeRenderer.tsx";
import type { PositionedNode } from "../layout/types.ts";

const make = (overrides: Partial<PositionedNode>): PositionedNode => ({
  id: "x",
  kind: "service",
  name: "X",
  description: "test fixture",
  x: 0,
  y: 0,
  width: 180,
  height: 80,
  children: [],
  ...overrides,
});

describe("NodeRenderer", () => {
  it("dispatches to ServiceNode for kind=service", () => {
    const { container } = render(
      <svg>
        <NodeRenderer node={make({ kind: "service", name: "Svc" })} />
      </svg>,
    );
    expect(container.querySelector(".archik-node--service")).not.toBeNull();
  });

  it("dispatches to DatabaseNode for kind=database", () => {
    const { container } = render(
      <svg>
        <NodeRenderer node={make({ kind: "database", name: "DB" })} />
      </svg>,
    );
    expect(container.querySelector(".archik-node--database")).not.toBeNull();
  });

  it("dispatches to QueueNode for kind=queue", () => {
    const { container } = render(
      <svg>
        <NodeRenderer node={make({ kind: "queue", name: "Q" })} />
      </svg>,
    );
    expect(container.querySelector(".archik-node--queue")).not.toBeNull();
  });

  it("translates the wrapper group by node x/y", () => {
    const { container } = render(
      <svg>
        <NodeRenderer node={make({ x: 100, y: 50 })} />
      </svg>,
    );
    const wrapper = container.querySelector("[data-archik-node-id='x']");
    expect(wrapper?.getAttribute("transform")).toBe("translate(100, 50)");
  });

  it("recurses into children", () => {
    const parent = make({
      id: "parent",
      kind: "custom",
      name: "Parent",
      width: 400,
      height: 200,
      children: [
        make({ id: "child-1", kind: "service", name: "Child 1", x: 20, y: 20 }),
        make({
          id: "child-2",
          kind: "database",
          name: "Child 2",
          x: 220,
          y: 20,
        }),
      ],
    });
    const { container } = render(
      <svg>
        <NodeRenderer node={parent} />
      </svg>,
    );
    expect(container.querySelector("[data-archik-node-id='child-1']")).not
      .toBeNull();
    expect(container.querySelector("[data-archik-node-id='child-2']")).not
      .toBeNull();
  });

  it("calls onSelectNode with the node id when clicked", () => {
    const onSelectNode = vi.fn();
    const { container } = render(
      <svg>
        <NodeRenderer node={make({ id: "api" })} onSelectNode={onSelectNode} />
      </svg>,
    );
    const wrapper = container.querySelector(
      "[data-archik-node-id='api']",
    ) as SVGGElement | null;
    expect(wrapper).not.toBeNull();
    wrapper!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSelectNode).toHaveBeenCalledTimes(1);
    expect(onSelectNode.mock.calls[0]![0]).toBe("api");
  });

  it("clicking a child fires only the child's selection (no parent firing)", () => {
    const onSelectNode = vi.fn();
    const parent = make({
      id: "parent",
      kind: "custom",
      name: "P",
      width: 400,
      height: 200,
      children: [
        make({ id: "child-1", kind: "service", name: "C1", x: 20, y: 20 }),
      ],
    });
    const { container } = render(
      <svg>
        <NodeRenderer node={parent} onSelectNode={onSelectNode} />
      </svg>,
    );
    const child = container.querySelector(
      "[data-archik-node-id='child-1']",
    ) as SVGGElement;
    child.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSelectNode).toHaveBeenCalledTimes(1);
    expect(onSelectNode.mock.calls[0]![0]).toBe("child-1");
  });

  it("marks the wrapper as selected when its id is in selectedNodeIds", () => {
    const { container } = render(
      <svg>
        <NodeRenderer
          node={make({ id: "api" })}
          selectedNodeIds={new Set(["api"])}
        />
      </svg>,
    );
    expect(
      container
        .querySelector("[data-archik-node-id='api']")
        ?.getAttribute("data-archik-selected"),
    ).toBe("true");
  });

  it("does not mark unrelated nodes as selected", () => {
    const { container } = render(
      <svg>
        <NodeRenderer
          node={make({ id: "api" })}
          selectedNodeIds={new Set(["other"])}
        />
      </svg>,
    );
    expect(
      container
        .querySelector("[data-archik-node-id='api']")
        ?.getAttribute("data-archik-selected"),
    ).not.toBe("true");
  });

  it("emits data-archik-status='proposed' so CSS can style planned nodes", () => {
    const { container } = render(
      <svg>
        <NodeRenderer node={make({ id: "api", status: "proposed" })} />
      </svg>,
    );
    expect(
      container
        .querySelector("[data-archik-node-id='api']")
        ?.getAttribute("data-archik-status"),
    ).toBe("proposed");
  });

  it("emits data-archik-status='deprecated' for nodes being phased out", () => {
    const { container } = render(
      <svg>
        <NodeRenderer node={make({ id: "api", status: "deprecated" })} />
      </svg>,
    );
    expect(
      container
        .querySelector("[data-archik-node-id='api']")
        ?.getAttribute("data-archik-status"),
    ).toBe("deprecated");
  });

  it("omits data-archik-status for active (default) nodes — keeps the DOM clean", () => {
    const { container } = render(
      <svg>
        <NodeRenderer node={make({ id: "api" })} />
      </svg>,
    );
    expect(
      container
        .querySelector("[data-archik-node-id='api']")
        ?.hasAttribute("data-archik-status"),
    ).toBe(false);
  });

  describe("ECB stereotype", () => {
    it.each(["boundary", "control", "entity"] as const)(
      "stamps data-archik-stereotype=%s and renders the colour band",
      (s) => {
        const { container } = render(
          <svg>
            <NodeRenderer node={make({ id: "n", stereotype: s })} />
          </svg>,
        );
        const wrap = container.querySelector("[data-archik-node-id='n']");
        expect(wrap?.getAttribute("data-archik-stereotype")).toBe(s);
        expect(
          wrap?.querySelector(".archik-stereotype-band"),
        ).not.toBeNull();
      },
    );

    it("omits both attribute and band when stereotype is unset", () => {
      const { container } = render(
        <svg>
          <NodeRenderer node={make({ id: "n" })} />
        </svg>,
      );
      const wrap = container.querySelector("[data-archik-node-id='n']");
      expect(wrap?.hasAttribute("data-archik-stereotype")).toBe(false);
      expect(wrap?.querySelector(".archik-stereotype-band")).toBeNull();
    });

    it("hides the band when showStereotypeBands is false but keeps the data attribute", () => {
      const { container } = render(
        <svg>
          <NodeRenderer
            node={make({ id: "n", stereotype: "boundary" })}
            showStereotypeBands={false}
          />
        </svg>,
      );
      const wrap = container.querySelector("[data-archik-node-id='n']");
      // The data attribute remains so other tooling (the inspector,
      // CSS rules, exported SVGs that get re-styled) keeps working
      // — only the visible band is gated.
      expect(wrap?.getAttribute("data-archik-stereotype")).toBe("boundary");
      expect(wrap?.querySelector(".archik-stereotype-band")).toBeNull();
    });

    it("clips the band to the cylinder path for database nodes so it sits on the lid", () => {
      const { container } = render(
        <svg>
          <NodeRenderer
            node={make({
              id: "db",
              kind: "database",
              stereotype: "entity",
              width: 180,
              height: 100,
            })}
          />
        </svg>,
      );
      const clip = container.querySelector("clipPath#archik-nclip-db");
      // The DB clip uses a path tracing the cylinder shape; other
      // kinds use a rounded rect. This guards the visual fix that
      // stops the band from overflowing past the curved top ellipse.
      expect(clip?.querySelector("path")).not.toBeNull();
      expect(clip?.querySelector("rect")).toBeNull();
    });

    it("clips the band to a rounded rect for non-database kinds", () => {
      const { container } = render(
        <svg>
          <NodeRenderer
            node={make({ id: "svc", kind: "service", stereotype: "control" })}
          />
        </svg>,
      );
      const clip = container.querySelector("clipPath#archik-nclip-svc");
      expect(clip?.querySelector("rect")).not.toBeNull();
      expect(clip?.querySelector("path")).toBeNull();
    });
  });
});
