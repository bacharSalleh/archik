import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Canvas } from "./Canvas.tsx";
import { ordersDocument } from "../domain/__fixtures__/orders.ts";

describe("Canvas", () => {
  it("eventually renders the diagram with nodes from the document", async () => {
    const { container } = render(<Canvas document={ordersDocument} />);
    await waitFor(() => {
      expect(container.querySelector("svg")).not.toBeNull();
    });
    for (const node of ordersDocument.nodes) {
      expect(
        container.querySelector(`[data-archik-node-id='${node.id}']`),
      ).not.toBeNull();
    }
  });

  it("shows a loading state before layout resolves", () => {
    render(<Canvas document={ordersDocument} />);
    expect(screen.getByText(/laying out/i)).toBeInTheDocument();
  });

  it("keeps the previous layout visible while a new layout is being computed", async () => {
    const { container, rerender, queryByText } = render(
      <Canvas document={ordersDocument} />,
    );
    await waitFor(() => {
      expect(container.querySelector("svg")).not.toBeNull();
    });
    const renamed = { ...ordersDocument, name: "Renamed" };
    rerender(<Canvas document={renamed} />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(queryByText(/laying out/i)).toBeNull();
  });

  describe("initial view", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("fits a diagram larger than the viewport so its nodes are visible on load", async () => {
      // jsdom has no layout; give every element a small 800x600 box so the
      // diagram (far bigger than that at 100%) must be zoomed out to fit.
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
      const { container } = render(
        <Canvas document={ordersDocument} viewKey="orders" />,
      );
      await waitFor(() => {
        const svg = container.querySelector("svg[viewBox]");
        expect(svg).not.toBeNull();
        expect(Number(svg!.getAttribute("width"))).toBeLessThanOrEqual(800);
        expect(Number(svg!.getAttribute("height"))).toBeLessThanOrEqual(600);
      });
    });
  });
});
