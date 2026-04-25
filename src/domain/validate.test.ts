import { describe, it, expect } from "vitest";
import { validateDocument, formatErrors } from "./validate.ts";

const validDoc = {
  version: "1.0",
  name: "Demo",
  nodes: [{ id: "api", kind: "service", name: "API" }],
  edges: [],
};

describe("validateDocument", () => {
  it("returns ok=true with the parsed document on success", () => {
    const result = validateDocument(validDoc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Demo");
      expect(result.value.nodes).toHaveLength(1);
    }
  });

  it("returns ok=false with errors on failure", () => {
    const result = validateDocument({ ...validDoc, version: "2.0" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("includes the field path in error messages", () => {
    const result = validateDocument({
      ...validDoc,
      nodes: [{ id: "BadId", kind: "service", name: "X" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.errors.map((e) => e.path);
      expect(paths.some((p) => p.includes("nodes") && p.includes("id"))).toBe(
        true,
      );
    }
  });

  it("reports multiple errors at once", () => {
    const result = validateDocument({
      version: "1.0",
      name: "Demo",
      nodes: [
        { id: "BadId", kind: "service", name: "X" },
        { id: "ok", kind: "not-a-kind", name: "Y" },
      ],
      edges: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("reports unknown keys with a clear path", () => {
    const result = validateDocument({
      ...validDoc,
      viewport: { x: 0, y: 0 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path.includes("viewport"))).toBe(true);
    }
  });
});

describe("formatErrors", () => {
  it("renders errors as a single human-readable string", () => {
    const result = validateDocument({
      ...validDoc,
      nodes: [{ id: "Nope", kind: "service", name: "X" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = formatErrors(result.errors);
      expect(text).toMatch(/nodes/);
      expect(text).toMatch(/id/);
    }
  });
});
