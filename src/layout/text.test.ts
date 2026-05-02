import { describe, expect, it } from "vitest";
import {
  estimateTextWidth,
  fitText,
  NAME_CHAR_PX,
  STACK_CHAR_PX,
  LABEL_CHAR_PX,
} from "./text.ts";

describe("estimateTextWidth", () => {
  it("returns charPx * text.length", () => {
    expect(estimateTextWidth("hello", 10)).toBe(50);
    expect(estimateTextWidth("", 10)).toBe(0);
    expect(estimateTextWidth("abc", NAME_CHAR_PX)).toBeCloseTo(3 * NAME_CHAR_PX);
  });

  it("scales with the charPx constant for each style", () => {
    const text = "Orders Service";
    expect(estimateTextWidth(text, NAME_CHAR_PX)).toBeCloseTo(text.length * NAME_CHAR_PX);
    expect(estimateTextWidth(text, STACK_CHAR_PX)).toBeCloseTo(text.length * STACK_CHAR_PX);
    expect(estimateTextWidth(text, LABEL_CHAR_PX)).toBeCloseTo(text.length * LABEL_CHAR_PX);
  });
});

describe("fitText", () => {
  it("returns the text unchanged when it fits within maxWidth", () => {
    expect(fitText("hi", 100, 10)).toBe("hi");
  });

  it("truncates and appends ellipsis when text is too long", () => {
    // maxWidth=30, charPx=10 → max 3 chars → "ab…"
    const result = fitText("abcdef", 30, 10);
    expect(result.at(-1)).toBe("…");
    expect(result.length).toBeLessThan("abcdef".length);
  });

  it("returns empty string for maxWidth <= 0", () => {
    expect(fitText("hello", 0, 10)).toBe("");
    expect(fitText("hello", -5, 10)).toBe("");
  });

  it("returns just the ellipsis when only one character fits", () => {
    // maxWidth=10, charPx=10 → max 1 char → can't fit text + "…" → "…"
    expect(fitText("hello", 10, 10)).toBe("…");
  });

  it("returns text unchanged when length exactly equals the slot", () => {
    // maxWidth=50, charPx=10 → slot=5, "hello".length=5 → no truncation
    expect(fitText("hello", 50, 10)).toBe("hello");
  });
});
