import { describe, it, expect } from "vitest";
import { RelationshipSchema, RELATIONSHIPS } from "./relationships.ts";

describe("Relationship taxonomy", () => {
  it("exposes the six edge relationships", () => {
    expect(RELATIONSHIPS).toEqual([
      "http_call",
      "reads",
      "writes",
      "publishes",
      "subscribes",
      "depends_on",
    ]);
  });

  it.each(RELATIONSHIPS)("accepts relationship %s", (rel) => {
    expect(RelationshipSchema.safeParse(rel).success).toBe(true);
  });

  it("rejects an unknown relationship", () => {
    expect(RelationshipSchema.safeParse("contains").success).toBe(false);
  });
});
