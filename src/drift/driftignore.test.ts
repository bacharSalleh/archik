import { describe, expect, it } from "vitest";
import { isIgnored, parseDriftignore } from "./driftignore.ts";

describe("parseDriftignore", () => {
  it("ignores blank lines and comments", () => {
    const rules = parseDriftignore(`
# comment
src/db/migrations/**

      # indented comment

**/*.generated.*
`);
    expect(rules).toHaveLength(2);
    expect(rules[0]!.pattern).toBe("src/db/migrations/**");
    expect(rules[1]!.pattern).toBe("**/*.generated.*");
  });

  it("returns empty array for empty input", () => {
    expect(parseDriftignore("")).toHaveLength(0);
    expect(parseDriftignore("# only comments\n")).toHaveLength(0);
  });
});

describe("isIgnored", () => {
  it("matches ** glob at end", () => {
    const rules = parseDriftignore("src/db/migrations/**\n");
    expect(isIgnored("src/db/migrations/", rules)).toBeDefined();
    expect(isIgnored("src/db/migrations/001_init.sql", rules)).toBeDefined();
    expect(isIgnored("src/db/migrations/sub/002.sql", rules)).toBeDefined();
    expect(isIgnored("src/db/", rules)).toBeUndefined();
    expect(isIgnored("src/services/", rules)).toBeUndefined();
  });

  it("matches ** glob at start", () => {
    const rules = parseDriftignore("**/*.generated.*\n");
    expect(isIgnored("src/api.generated.ts", rules)).toBeDefined();
    expect(isIgnored("lib/schema.generated.json", rules)).toBeDefined();
    expect(isIgnored("src/index.ts", rules)).toBeUndefined();
  });

  it("matches single * within segment", () => {
    const rules = parseDriftignore("*.log\n");
    expect(isIgnored("app.log", rules)).toBeDefined();
    expect(isIgnored("debug.log", rules)).toBeDefined();
    expect(isIgnored("src/app.log", rules)).toBeUndefined();
  });

  it("matches exact path", () => {
    const rules = parseDriftignore("src/config/local.ts\n");
    expect(isIgnored("src/config/local.ts", rules)).toBeDefined();
    expect(isIgnored("src/config/production.ts", rules)).toBeUndefined();
  });

  it("returns undefined when no rules match", () => {
    const rules = parseDriftignore("terraform/**\n");
    expect(isIgnored("src/services/orders/", rules)).toBeUndefined();
  });
});
