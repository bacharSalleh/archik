import { describe, it, expect } from "vitest";
import { NodeKindSchema, NODE_KINDS } from "./taxonomy.ts";

describe("NodeKind taxonomy", () => {
  it("exposes the eight architectural node kinds", () => {
    expect(NODE_KINDS).toEqual([
      "service",
      "database",
      "queue",
      "cache",
      "frontend",
      "external",
      "function",
      "custom",
    ]);
  });

  it.each(NODE_KINDS)("accepts kind %s", (kind) => {
    expect(NodeKindSchema.safeParse(kind).success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(NodeKindSchema.safeParse("widget").success).toBe(false);
  });
});
