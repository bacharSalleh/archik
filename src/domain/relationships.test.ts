import { describe, it, expect } from "vitest";
import { RelationshipSchema, RELATIONSHIPS } from "./relationships.ts";

describe("Relationship taxonomy", () => {
  it("includes the original six edge relationships", () => {
    for (const r of [
      "http_call",
      "reads",
      "writes",
      "publishes",
      "subscribes",
      "depends_on",
    ] as const) {
      expect(RELATIONSHIPS).toContain(r);
    }
  });

  it("includes the expanded relationships (invokes, implements, etc.)", () => {
    for (const r of [
      "invokes",
      "routes_to",
      "streams_to",
      "implements",
    ] as const) {
      expect(RELATIONSHIPS).toContain(r);
    }
  });

  it.each(RELATIONSHIPS)("accepts relationship %s", (rel) => {
    expect(RelationshipSchema.safeParse(rel).success).toBe(true);
  });

  it("rejects an unknown relationship", () => {
    expect(RelationshipSchema.safeParse("contains").success).toBe(false);
  });
});
