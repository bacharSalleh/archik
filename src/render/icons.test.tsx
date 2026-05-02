import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { trayCenters, iconAnchorsFor, InfoIcon, NotesIcon } from "./icons.tsx";

describe("trayCenters", () => {
  it("returns an empty array for count 0", () => {
    expect(trayCenters({ x: 100, y: 14 }, 0)).toHaveLength(0);
  });

  it("returns a single point equal to rightmost for count 1", () => {
    const result = trayCenters({ x: 100, y: 14 }, 1);
    expect(result).toEqual([{ x: 100, y: 14 }]);
  });

  it("spaces slots 18px apart to the left", () => {
    const result = trayCenters({ x: 100, y: 14 }, 3);
    expect(result).toEqual([
      { x: 100, y: 14 },
      { x: 82, y: 14 },
      { x: 64, y: 14 },
    ]);
  });

  it("preserves the y coordinate across all slots", () => {
    const result = trayCenters({ x: 80, y: 22 }, 4);
    expect(result.every((p) => p.y === 22)).toBe(true);
  });
});

describe("iconAnchorsFor", () => {
  it("places right anchor 14px from the right edge for standard kinds", () => {
    const result = iconAnchorsFor("service", 120, 50);
    expect(result.right.x).toBe(120 - 14);
    expect(result.right.y).toBe(14); // HEADER_MID
  });

  it("places right anchor in the footer strip for database nodes", () => {
    const result = iconAnchorsFor("database", 120, 80);
    expect(result.right.x).toBe(120 - 14);
    expect(result.right.y).toBe(80 - 11); // height - footer offset
  });

  it("respects the capsule radius for queue nodes", () => {
    // queue: r = min(h/2, 28); right.x = width - r - 4
    const result = iconAnchorsFor("queue", 160, 60);
    const r = Math.min(60 / 2, 28); // 28
    expect(result.right.x).toBe(160 - r - 4);
    expect(result.right.y).toBe(14);
  });

  it("clamps queue radius to 28 for tall nodes", () => {
    const result = iconAnchorsFor("queue", 200, 200);
    expect(result.right.x).toBe(200 - 28 - 4);
  });
});

describe("InfoIcon / NotesIcon", () => {
  it("InfoIcon renders without crashing and is aria-hidden", () => {
    const { container } = render(
      <svg>
        <InfoIcon cx={10} cy={10} />
      </svg>,
    );
    const g = container.querySelector("g[aria-hidden]");
    expect(g).not.toBeNull();
  });

  it("NotesIcon renders without crashing and is aria-hidden", () => {
    const { container } = render(
      <svg>
        <NotesIcon cx={10} cy={10} />
      </svg>,
    );
    const g = container.querySelector("g[aria-hidden]");
    expect(g).not.toBeNull();
  });
});
