import { describe, expect, it } from "vitest";
import {
  diamondArrowPath,
  filledArrowPath,
  openArrowPath,
  triangleArrowPath,
} from "./arrowhead.ts";

describe("filledArrowPath", () => {
  it("points the tip at the edge end, base behind it", () => {
    // Edge travelling left→right along y=0, tip at (100, 0).
    const d = filledArrowPath({ x: 100, y: 0 }, { x: 0, y: 0 });
    expect(d).toBe("M 90 4 L 100 0 L 90 -4 Z");
  });

  it("rotates with the edge direction", () => {
    // Edge travelling top→bottom, tip at (0, 100).
    const d = filledArrowPath({ x: 0, y: 100 }, { x: 0, y: 0 });
    expect(d).toBe("M -4 90 L 0 100 L 4 90 Z");
  });

  it("returns empty string for a degenerate segment", () => {
    expect(filledArrowPath({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe("");
  });
});

describe("openArrowPath", () => {
  it("draws an open chevron (no closing Z)", () => {
    const d = openArrowPath({ x: 100, y: 0 }, { x: 0, y: 0 });
    expect(d).toBe("M 90 4.5 L 100 0 L 90 -4.5");
    expect(d).not.toContain("Z");
  });
});

describe("triangleArrowPath", () => {
  it("is larger than the plain filled head (UML proportions)", () => {
    const d = triangleArrowPath({ x: 100, y: 0 }, { x: 0, y: 0 });
    expect(d).toBe("M 86 6 L 100 0 L 86 -6 Z");
  });
});

describe("diamondArrowPath", () => {
  it("sits at the owner end with the tip on the node boundary", () => {
    // Edge starts at (0,0) heading right.
    const d = diamondArrowPath({ x: 0, y: 0 }, { x: 50, y: 0 });
    expect(d).toBe("M 0 0 L 7 4.5 L 14 0 L 7 -4.5 Z");
  });
});
