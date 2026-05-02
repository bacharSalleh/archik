import { describe, expect, it } from "vitest";
import { NODE_KINDS } from "../domain/taxonomy.ts";
import { KIND_META } from "./kindPalette.ts";

describe("KIND_META", () => {
  it("has an entry for every node kind in the taxonomy", () => {
    for (const kind of NODE_KINDS) {
      expect(KIND_META).toHaveProperty(kind);
    }
  });

  it("every entry has a non-empty hex color", () => {
    for (const kind of NODE_KINDS) {
      const meta = KIND_META[kind];
      expect(meta.color).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    }
  });

  it("every entry has a non-empty description string", () => {
    for (const kind of NODE_KINDS) {
      const meta = KIND_META[kind];
      expect(typeof meta.description).toBe("string");
      expect(meta.description.length).toBeGreaterThan(0);
    }
  });

  it("every entry has an icon (truthy component reference)", () => {
    for (const kind of NODE_KINDS) {
      const meta = KIND_META[kind];
      expect(meta.icon).toBeTruthy();
    }
  });

  it("has no extra entries not in the taxonomy", () => {
    const extra = Object.keys(KIND_META).filter(
      (k) => !NODE_KINDS.includes(k as (typeof NODE_KINDS)[number]),
    );
    expect(extra).toHaveLength(0);
  });
});
