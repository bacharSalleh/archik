import { describe, it, expect } from "vitest";
import { fitZoom } from "./fitZoom.ts";

describe("fitZoom", () => {
  it("shrinks a large diagram so all of it fits in the viewport", () => {
    // The repo's own main.archik.yaml: SVG ~3418x2594 in a ~990x665 pane.
    const z = fitZoom(
      { width: 3418, height: 2594 },
      { width: 990, height: 665 },
      0.1,
      4,
    );
    expect(3418 * z).toBeLessThanOrEqual(990);
    expect(2594 * z).toBeLessThanOrEqual(665);
    expect(z).toBeCloseTo(665 / 2594, 5);
  });

  it("never magnifies a diagram that already fits", () => {
    expect(
      fitZoom({ width: 400, height: 300 }, { width: 990, height: 665 }, 0.25, 4),
    ).toBe(1);
  });

  it("clamps to the minimum zoom for huge diagrams", () => {
    expect(
      fitZoom(
        { width: 20000, height: 20000 },
        { width: 990, height: 665 },
        0.25,
        4,
      ),
    ).toBe(0.25);
  });

  it("returns 1 when the viewport has no size yet (e.g. jsdom)", () => {
    expect(
      fitZoom({ width: 3418, height: 2594 }, { width: 0, height: 0 }, 0.25, 4),
    ).toBe(1);
  });
});
