import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DiagramSvg } from "./DiagramSvg.tsx";
import type { PositionedDocument } from "../layout/types.ts";

const empty: PositionedDocument = {
  document: { version: "1.0", name: "Empty", nodes: [], edges: [] },
  width: 0,
  height: 0,
  roots: [],
  edges: [],
};

const populated: PositionedDocument = {
  document: {
    version: "1.0",
    name: "Demo",
    nodes: [
      { id: "api", kind: "service", name: "API", description: "test fixture" },
      { id: "db", kind: "database", name: "DB", description: "test fixture" },
    ],
    edges: [{ id: "e1", from: "api", to: "db", relationship: "writes" }],
  },
  width: 400,
  height: 200,
  roots: [
    {
      id: "api",
      kind: "service",
      name: "API",
      description: "test fixture",
      x: 0,
      y: 50,
      width: 180,
      height: 80,
      children: [],
    },
    {
      id: "db",
      kind: "database",
      name: "DB",
      description: "test fixture",
      x: 240,
      y: 50,
      width: 140,
      height: 90,
      children: [],
    },
  ],
  edges: [
    {
      id: "e1",
      from: "api",
      to: "db",
      relationship: "writes",
      sections: [
        {
          startPoint: { x: 180, y: 90 },
          endPoint: { x: 240, y: 95 },
          bendPoints: [],
        },
      ],
      labels: [],
    },
  ],
};

describe("DiagramSvg", () => {
  it("renders an svg element", () => {
    const { container } = render(<DiagramSvg positioned={empty} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("includes the three shape markers in defs", () => {
    const { container } = render(<DiagramSvg positioned={populated} />);
    for (const id of [
      "archik-arrow-filled",
      "archik-arrow-open",
      "archik-arrow-selected",
    ]) {
      expect(container.querySelector(`defs marker#${id}`)).not.toBeNull();
    }
  });

  it("renders every root node via NodeRenderer", () => {
    const { container } = render(<DiagramSvg positioned={populated} />);
    expect(container.querySelector("[data-archik-node-id='api']")).not
      .toBeNull();
    expect(container.querySelector("[data-archik-node-id='db']")).not
      .toBeNull();
  });

  it("renders every edge via EdgeRenderer", () => {
    const { container } = render(<DiagramSvg positioned={populated} />);
    expect(container.querySelector("[data-archik-edge-id='e1']")).not
      .toBeNull();
  });

  it("sets a viewBox that contains the diagram", () => {
    const { container } = render(<DiagramSvg positioned={populated} />);
    const svg = container.querySelector("svg")!;
    const viewBox = svg.getAttribute("viewBox");
    expect(viewBox).toBeTruthy();
    const parts = viewBox!.split(/\s+/).map(Number);
    const [vx, vy, vw, vh] = parts as [number, number, number, number];
    expect(vw).toBeGreaterThanOrEqual(populated.width);
    expect(vh).toBeGreaterThanOrEqual(populated.height);
    expect(vx).toBeLessThanOrEqual(0);
    expect(vy).toBeLessThanOrEqual(0);
  });

});
