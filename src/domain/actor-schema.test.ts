import { describe, expect, it } from "vitest";
import { ActorDocumentSchema } from "./actor-schema.ts";

describe("ActorDocumentSchema", () => {
  it("accepts a minimal valid actors file", () => {
    const result = ActorDocumentSchema.safeParse({
      version: "1.0",
      actors: [
        { id: "customer", kind: "human", description: "End-user buying products." },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts every actor kind", () => {
    const kinds = ["human", "external-system", "time", "device"] as const;
    for (const kind of kinds) {
      const result = ActorDocumentSchema.safeParse({
        version: "1.0",
        actors: [{ id: `a-${kind}`, kind, description: "test" }],
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts goals as an array of strings", () => {
    const result = ActorDocumentSchema.safeParse({
      version: "1.0",
      actors: [{
        id: "customer",
        kind: "human",
        description: "End user.",
        goals: ["place-order", "view-history"],
      }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing version", () => {
    const result = ActorDocumentSchema.safeParse({
      actors: [{ id: "customer", kind: "human", description: "x" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty actors array", () => {
    const result = ActorDocumentSchema.safeParse({
      version: "1.0",
      actors: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty description", () => {
    const result = ActorDocumentSchema.safeParse({
      version: "1.0",
      actors: [{ id: "customer", kind: "human", description: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown actor kind", () => {
    const result = ActorDocumentSchema.safeParse({
      version: "1.0",
      actors: [{ id: "customer", kind: "alien", description: "x" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed id (not kebab-case)", () => {
    const result = ActorDocumentSchema.safeParse({
      version: "1.0",
      actors: [{ id: "Customer", kind: "human", description: "x" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate actor ids", () => {
    const result = ActorDocumentSchema.safeParse({
      version: "1.0",
      actors: [
        { id: "customer", kind: "human", description: "first" },
        { id: "customer", kind: "external-system", description: "second" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("duplicate actor id"))).toBe(true);
    }
  });

  it("rejects unknown top-level keys", () => {
    const result = ActorDocumentSchema.safeParse({
      version: "1.0",
      actors: [{ id: "customer", kind: "human", description: "x" }],
      something: 1,
    });
    expect(result.success).toBe(false);
  });
});
