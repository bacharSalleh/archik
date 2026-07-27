import { describe, expect, it } from "vitest";
import { midpoint, pinchDistance, zoomFromPinch } from "./pinch.ts";

describe("pinchDistance", () => {
  it("computes the euclidean distance between two points", () => {
    expect(pinchDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("is zero for coincident points", () => {
    expect(pinchDistance({ x: 7, y: 7 }, { x: 7, y: 7 })).toBe(0);
  });
});

describe("midpoint", () => {
  it("averages the two points", () => {
    expect(midpoint({ x: 0, y: 10 }, { x: 20, y: 30 })).toEqual({
      x: 10,
      y: 20,
    });
  });
});

describe("zoomFromPinch", () => {
  it("scales the start zoom by the distance ratio", () => {
    expect(zoomFromPinch(100, 200, 1, 0.25, 4)).toBe(2);
    expect(zoomFromPinch(100, 50, 1, 0.25, 4)).toBe(0.5);
  });

  it("clamps at the max zoom", () => {
    expect(zoomFromPinch(100, 1000, 1, 0.25, 4)).toBe(4);
  });

  it("clamps at the min zoom", () => {
    expect(zoomFromPinch(100, 1, 1, 0.25, 4)).toBe(0.25);
  });

  it("returns the clamped start zoom for a degenerate start distance", () => {
    expect(zoomFromPinch(0, 100, 1, 0.25, 4)).toBe(1);
    expect(zoomFromPinch(0.5, 100, 10, 0.25, 4)).toBe(4);
  });
});
