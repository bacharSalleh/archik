import { describe, it, expect } from "vitest";
import {
  checkCrossFileReferences,
  validateDocument,
  formatErrors,
} from "./validate.ts";
import type { Document } from "./types.ts";

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

describe("checkCrossFileReferences", () => {
  const baseDoc: Document = {
    version: "1.0",
    name: "Demo",
    nodes: [
      {
        id: "agent",
        kind: "agent",
        name: "Agent",
        archikFile: ".archik/agent-loop.archik.yaml",
      },
      {
        id: "api",
        kind: "service",
        name: "API",
      },
    ],
    edges: [
      {
        id: "api-to-agent",
        from: "api",
        to: "agent",
        relationship: "invokes",
      },
      {
        id: "api-payments",
        from: "api",
        to: "charge",
        toFile: ".archik/payments.archik.yaml",
        relationship: "http_call",
      },
    ],
  };

  it("returns no errors when every cross-file path exists", () => {
    const present = new Set([
      ".archik/agent-loop.archik.yaml",
      ".archik/payments.archik.yaml",
    ]);
    const errors = checkCrossFileReferences(baseDoc, (rel) => present.has(rel));
    expect(errors).toEqual([]);
  });

  it("flags a missing archikFile (e.g. typed without the .archik/ prefix)", () => {
    const broken: Document = {
      ...baseDoc,
      nodes: [
        {
          id: "agent",
          kind: "agent",
          name: "Agent",
          archikFile: "agent-loop.archik.yaml", // missing `.archik/`
        },
      ],
      edges: [],
    };
    const errors = checkCrossFileReferences(broken, () => false);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe("nodes.0.archikFile");
    expect(errors[0]!.message).toMatch(/agent-loop\.archik\.yaml/);
    expect(errors[0]!.message).toMatch(/does not exist/);
  });

  it("flags a missing toFile on a cross-file edge", () => {
    const errors = checkCrossFileReferences(
      baseDoc,
      (rel) => rel === ".archik/agent-loop.archik.yaml",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe("edges.1.toFile");
  });

  it("flags a missing fromFile", () => {
    const doc: Document = {
      ...baseDoc,
      nodes: [{ id: "api", kind: "service", name: "API" }],
      edges: [
        {
          id: "ext-api",
          from: "external",
          to: "api",
          fromFile: ".archik/external.archik.yaml",
          relationship: "http_call",
        },
      ],
    };
    const errors = checkCrossFileReferences(doc, () => false);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe("edges.0.fromFile");
  });

  it("ignores nodes / edges without cross-file references", () => {
    const doc: Document = {
      version: "1.0",
      name: "Demo",
      nodes: [{ id: "api", kind: "service", name: "API" }],
      edges: [],
    };
    const errors = checkCrossFileReferences(doc, () => false);
    expect(errors).toEqual([]);
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
