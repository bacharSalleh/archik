import { describe, expect, it } from "vitest";
import { parseOptions, getString } from "./options.ts";

describe("parseOptions", () => {
  it("collects positional args in _", () => {
    const opts = parseOptions(["foo", "bar"]);
    expect(opts._).toEqual(["foo", "bar"]);
  });

  it("parses --flag value (space form)", () => {
    const opts = parseOptions(["--out", "file.svg"]);
    expect(opts["out"]).toBe("file.svg");
    expect(opts._).toEqual([]);
  });

  it("parses --flag=value (equals form)", () => {
    const opts = parseOptions(["--theme=light"]);
    expect(opts["theme"]).toBe("light");
  });

  it("treats --flag with no value as boolean true", () => {
    const opts = parseOptions(["--json"]);
    expect(opts["json"]).toBe("true");
  });

  it("treats --flag followed by another flag as boolean true", () => {
    const opts = parseOptions(["--json", "--verbose"]);
    expect(opts["json"]).toBe("true");
    expect(opts["verbose"]).toBe("true");
  });

  it("treats non-flag token after a bare --flag as the flag's value", () => {
    // The parser is greedy: --json after.yaml → json="after.yaml", not json=true
    const opts = parseOptions(["before.yaml", "--json", "after.yaml"]);
    expect(opts._).toEqual(["before.yaml"]);
    expect(opts["json"]).toBe("after.yaml");
  });

  it("treats non-flag tokens before flags as positionals", () => {
    const opts = parseOptions(["before.yaml", "after.yaml", "--json"]);
    expect(opts._).toEqual(["before.yaml", "after.yaml"]);
    expect(opts["json"]).toBe("true");
  });

  it("preserves the value when the flag is last and value is next token", () => {
    const opts = parseOptions(["--kind", "service", "extra"]);
    expect(opts["kind"]).toBe("service");
    expect(opts._).toEqual(["extra"]);
  });

  it("returns empty _ and no flags for an empty args array", () => {
    const opts = parseOptions([]);
    expect(opts._).toEqual([]);
    expect(Object.keys(opts).filter((k) => k !== "_")).toHaveLength(0);
  });
});

describe("getString", () => {
  it("returns the string value for a known flag", () => {
    const opts = parseOptions(["--theme", "dark"]);
    expect(getString(opts, "theme")).toBe("dark");
  });

  it("returns undefined for an absent flag", () => {
    const opts = parseOptions([]);
    expect(getString(opts, "missing")).toBeUndefined();
  });

  it("returns the first element when the value is an array", () => {
    const opts = { _: [], multi: ["a", "b"] };
    expect(getString(opts, "multi")).toBe("a");
  });
});
