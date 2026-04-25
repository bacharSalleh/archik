import { describe, it, expect } from "vitest";
import { slugify, uniqueId } from "./idGen.ts";

describe("slugify", () => {
  it.each([
    ["Orders API", "orders-api"],
    ["  Orders DB  ", "orders-db"],
    ["foo_bar", "foo-bar"],
    ["foo/bar.baz", "foo-bar-baz"],
    ["UPPER", "upper"],
    ["foo123", "foo123"],
    ["  -foo-  ", "foo"],
    ["x", "x"],
  ])("slugifies %j → %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("returns empty string when nothing remains", () => {
    expect(slugify("!@#$")).toBe("");
  });

  it("strips a leading digit (id pattern requires leading letter)", () => {
    expect(slugify("123 service")).toBe("service");
  });
});

describe("uniqueId", () => {
  it("returns the base when not taken", () => {
    expect(uniqueId("api", new Set())).toBe("api");
  });

  it("appends -2 on first collision", () => {
    expect(uniqueId("api", new Set(["api"]))).toBe("api-2");
  });

  it("keeps incrementing until it finds a free suffix", () => {
    expect(
      uniqueId("api", new Set(["api", "api-2", "api-3"])),
    ).toBe("api-4");
  });

  it("falls back to the provided default when base is empty", () => {
    expect(uniqueId("", new Set(), "service")).toBe("service");
  });

  it("falls back + suffixes when default is also taken", () => {
    expect(uniqueId("", new Set(["service"]), "service")).toBe("service-2");
  });
});
