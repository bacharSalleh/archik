import { describe, expect, it } from "vitest";
import { UseCaseDocumentSchema } from "./usecase-schema.ts";

const minimal = () => ({
  version: "1.0" as const,
  id: "place-order",
  name: "Place an order",
  primaryActor: "customer",
  goal: "Customer pays for cart and receives confirmation.",
  flows: {
    basic: { steps: ["Submit cart", "Charge payment", "Confirm order"] },
  },
  slices: [
    {
      id: "happy-path",
      description: "Cart is valid; payment succeeds; order persisted.",
      flows: ["basic"],
      tests: ["tests/e2e/place-order.happy.spec.ts"],
    },
  ],
});

describe("UseCaseDocumentSchema", () => {
  it("accepts a minimal valid use case", () => {
    const result = UseCaseDocumentSchema.safeParse(minimal());
    expect(result.success).toBe(true);
  });

  it("accepts a use case with alternates and a slice covering them", () => {
    const doc = {
      ...minimal(),
      flows: {
        basic: { steps: ["Submit cart", "Charge payment", "Confirm order"] },
        alternates: [
          {
            id: "payment-declined",
            branchFrom: "basic.2",
            steps: ["Gateway declines", "Surface error"],
          },
        ],
      },
      slices: [
        {
          id: "happy-path",
          description: "Cart is valid; payment succeeds.",
          flows: ["basic"],
          tests: ["tests/e2e/happy.spec.ts"],
        },
        {
          id: "declined",
          description: "Cart is valid; payment fails; user sees error.",
          flows: ["basic", "payment-declined"],
          tests: ["tests/e2e/declined.spec.ts"],
        },
      ],
    };
    const result = UseCaseDocumentSchema.safeParse(doc);
    expect(result.success).toBe(true);
  });

  it("accepts a proposed slice without tests", () => {
    const doc = {
      ...minimal(),
      slices: [{
        id: "happy-path",
        description: "Future cart flow.",
        flows: ["basic"],
        status: "proposed",
      }],
    };
    const result = UseCaseDocumentSchema.safeParse(doc);
    expect(result.success).toBe(true);
  });

  it("rejects active slice with no tests", () => {
    const doc = {
      ...minimal(),
      slices: [{
        id: "happy-path",
        description: "Active slice.",
        flows: ["basic"],
      }],
    };
    const result = UseCaseDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("at least one test path"))).toBe(true);
    }
  });

  it("rejects slice that doesn't include the basic flow", () => {
    const doc = {
      ...minimal(),
      flows: {
        basic: { steps: ["a"] },
        alternates: [{ id: "alt", branchFrom: "basic.1", steps: ["b"] }],
      },
      slices: [{
        id: "alt-only",
        description: "Branch only.",
        flows: ["alt"],
        tests: ["tests/x.spec.ts"],
      }],
    };
    const result = UseCaseDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("does not include the basic flow"))).toBe(true);
    }
  });

  it("rejects slice referencing unknown flow", () => {
    const doc = {
      ...minimal(),
      slices: [{
        id: "happy-path",
        description: "test",
        flows: ["basic", "ghost"],
        tests: ["t.spec.ts"],
      }],
    };
    const result = UseCaseDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("unknown flow \"ghost\""))).toBe(true);
    }
  });

  it("rejects branchFrom referencing unknown flow", () => {
    const doc = {
      ...minimal(),
      flows: {
        basic: { steps: ["a", "b"] },
        alternates: [{ id: "alt", branchFrom: "ghost.1", steps: ["x"] }],
      },
    };
    const result = UseCaseDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("unknown flow \"ghost\""))).toBe(true);
    }
  });

  it("rejects branchFrom step out of range", () => {
    const doc = {
      ...minimal(),
      flows: {
        basic: { steps: ["a", "b"] },
        alternates: [{ id: "alt", branchFrom: "basic.5", steps: ["x"] }],
      },
    };
    const result = UseCaseDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("out of range"))).toBe(true);
    }
  });

  it("rejects malformed branchFrom format", () => {
    const doc = {
      ...minimal(),
      flows: {
        basic: { steps: ["a"] },
        alternates: [{ id: "alt", branchFrom: "basic-1", steps: ["x"] }],
      },
    };
    const result = UseCaseDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
  });

  it("rejects duplicate slice ids", () => {
    const doc = {
      ...minimal(),
      slices: [
        {
          id: "dup",
          description: "first",
          flows: ["basic"],
          tests: ["a.spec.ts"],
        },
        {
          id: "dup",
          description: "second",
          flows: ["basic"],
          tests: ["b.spec.ts"],
        },
      ],
    };
    const result = UseCaseDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("duplicate slice id"))).toBe(true);
    }
  });

  it("rejects duplicate alternate flow ids", () => {
    const doc = {
      ...minimal(),
      flows: {
        basic: { steps: ["a"] },
        alternates: [
          { id: "alt", branchFrom: "basic.1", steps: ["x"] },
          { id: "alt", branchFrom: "basic.1", steps: ["y"] },
        ],
      },
    };
    const result = UseCaseDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("duplicate alternate flow id"))).toBe(true);
    }
  });

  it("rejects an alternate with id 'basic'", () => {
    const doc = {
      ...minimal(),
      flows: {
        basic: { steps: ["a"] },
        alternates: [{ id: "basic", branchFrom: "basic.1", steps: ["x"] }],
      },
    };
    const result = UseCaseDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
  });

  it("rejects empty slices array", () => {
    const result = UseCaseDocumentSchema.safeParse({
      ...minimal(),
      slices: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty basic flow steps", () => {
    const result = UseCaseDocumentSchema.safeParse({
      ...minimal(),
      flows: { basic: { steps: [] } },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a slice with realization.seqFile", () => {
    const doc = {
      ...minimal(),
      slices: [{
        id: "happy-path",
        description: "Happy path",
        flows: ["basic"],
        tests: ["t.spec.ts"],
        realization: { seqFile: ".archik/place-order.happy.archik.seq.yaml" },
      }],
    };
    const result = UseCaseDocumentSchema.safeParse(doc);
    expect(result.success).toBe(true);
  });

  it("rejects a realization seqFile with the wrong extension", () => {
    const doc = {
      ...minimal(),
      slices: [{
        id: "happy-path",
        description: "Happy path",
        flows: ["basic"],
        tests: ["t.spec.ts"],
        realization: { seqFile: ".archik/place-order.archik.yaml" },
      }],
    };
    const result = UseCaseDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
  });

  it("rejects unknown top-level keys", () => {
    const result = UseCaseDocumentSchema.safeParse({
      ...minimal(),
      something: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects test path with leading slash", () => {
    const doc = {
      ...minimal(),
      slices: [{
        id: "happy-path",
        description: "x",
        flows: ["basic"],
        tests: ["/abs/path/test.spec.ts"],
      }],
    };
    const result = UseCaseDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
  });

  it("rejects test path with `..` segment", () => {
    const doc = {
      ...minimal(),
      slices: [{
        id: "happy-path",
        description: "x",
        flows: ["basic"],
        tests: ["../escape/test.spec.ts"],
      }],
    };
    const result = UseCaseDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
  });

  it("rejects test path with a Windows drive letter (M6 fix B4)", () => {
    const doc = {
      ...minimal(),
      slices: [{
        id: "happy-path",
        description: "x",
        flows: ["basic"],
        tests: ["C:/tmp/foo.test.ts"],
      }],
    };
    const result = UseCaseDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
  });
});
