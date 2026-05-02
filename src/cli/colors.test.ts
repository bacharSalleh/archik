import { describe, expect, it } from "vitest";
import { bold, dim, red, green, yellow, cyan, gray, tick, cross, arrow } from "./colors.ts";

// In the test runner stdout is not a TTY and NO FORCE_COLOR is set, so
// ANSI wrapping is disabled and every function is an identity transform.
// Tests pin: (a) the returned value always contains the original text,
// (b) the semantic helpers always contain their intended symbol.

describe("color helpers (non-TTY — identity mode)", () => {
  it("bold returns a string containing the input", () => {
    expect(bold("hello")).toContain("hello");
  });

  it("dim returns a string containing the input", () => {
    expect(dim("quiet")).toContain("quiet");
  });

  it("red returns a string containing the input", () => {
    expect(red("error")).toContain("error");
  });

  it("green returns a string containing the input", () => {
    expect(green("ok")).toContain("ok");
  });

  it("yellow returns a string containing the input", () => {
    expect(yellow("warn")).toContain("warn");
  });

  it("cyan returns a string containing the input", () => {
    expect(cyan("info")).toContain("info");
  });

  it("gray returns a string containing the input", () => {
    expect(gray("muted")).toContain("muted");
  });
});

describe("semantic helpers", () => {
  it("tick() returns a string containing ✓", () => {
    expect(tick()).toContain("✓");
  });

  it("cross() returns a string containing ✗", () => {
    expect(cross()).toContain("✗");
  });

  it("arrow() returns a string containing ▸", () => {
    expect(arrow()).toContain("▸");
  });
});
