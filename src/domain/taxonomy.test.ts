import { describe, it, expect } from "vitest";
import { NodeKindSchema, NODE_KINDS, isCodeBearing } from "./taxonomy.ts";

describe("NodeKind taxonomy", () => {
  it("includes the original eight architectural node kinds", () => {
    for (const k of [
      "service",
      "database",
      "queue",
      "cache",
      "frontend",
      "external",
      "function",
      "custom",
    ] as const) {
      expect(NODE_KINDS).toContain(k);
    }
  });

  it("includes the expanded taxonomy (compute, data, messaging, AI, infra, hex)", () => {
    for (const k of [
      "worker",
      "agent",
      "vectordb",
      "storage",
      "topic",
      "stream",
      "gateway",
      "cdn",
      "route",
      "interface",
      "adapter",
      "port",
      "llm",
      "prompt",
      "tool",
      "auth",
      "observability",
      "cloud",
      "module",
    ] as const) {
      expect(NODE_KINDS).toContain(k);
    }
  });

  it("includes the UML data-type kinds and treats them as code-bearing", () => {
    for (const k of ["model", "dto", "dataobject"] as const) {
      expect(NODE_KINDS).toContain(k);
      expect(isCodeBearing(k)).toBe(true);
    }
  });

  it.each(NODE_KINDS)("accepts kind %s", (kind) => {
    expect(NodeKindSchema.safeParse(kind).success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(NodeKindSchema.safeParse("widget").success).toBe(false);
  });
});
