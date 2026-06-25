import { describe, it, expect } from "vitest";
import {
  RelationshipSchema,
  RELATIONSHIPS,
  RELATIONSHIP_CATEGORY,
  relationshipCategory,
} from "./relationships.ts";

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

describe("relationship categories", () => {
  it("classifies every relationship exactly once", () => {
    for (const rel of RELATIONSHIPS) {
      const cat = RELATIONSHIP_CATEGORY[rel];
      expect(cat === "runtime" || cat === "structural").toBe(true);
    }
    expect(Object.keys(RELATIONSHIP_CATEGORY).length).toBe(RELATIONSHIPS.length);
  });

  it("marks lightweight/static relationships as structural", () => {
    expect(relationshipCategory("uses")).toBe("structural");
    expect(relationshipCategory("depends_on")).toBe("structural");
    expect(relationshipCategory("has_a")).toBe("structural");
    expect(relationshipCategory("implements")).toBe("structural");
    expect(relationshipCategory("extends")).toBe("structural");
  });

  it("marks runtime traffic as runtime", () => {
    expect(relationshipCategory("http_call")).toBe("runtime");
    expect(relationshipCategory("reads")).toBe("runtime");
    expect(relationshipCategory("writes")).toBe("runtime");
    expect(relationshipCategory("publishes")).toBe("runtime");
    expect(relationshipCategory("subscribes")).toBe("runtime");
  });
});
