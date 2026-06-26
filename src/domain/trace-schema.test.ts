import { describe, expect, it } from "vitest";
import { TraceDocumentSchema } from "./trace-schema.ts";

const base = {
  version: "1.0",
  useCase: "place-order",
  slice: "happy-path",
  recordedAt: "2026-06-26T10:00:00Z",
  steps: [
    { id: "m1", from: "browser", to: "api", label: "POST /login", data: { in: { a: 1 }, out: { token: "x" } } },
  ],
};

describe("TraceDocumentSchema", () => {
  it("accepts a minimal valid trace", () => {
    expect(TraceDocumentSchema.safeParse(base).success).toBe(true);
  });

  it("accepts an optional seqFile and arbitrary JSON data", () => {
    const doc = { ...base, seqFile: ".archik/x.archik.seq.yaml", steps: [{ from: "a", to: "b", label: "do", data: { out: [1, "two", { z: true }] } }] };
    expect(TraceDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("requires at least one step", () => {
    expect(TraceDocumentSchema.safeParse({ ...base, steps: [] }).success).toBe(false);
  });

  it("requires from/to/label on a step", () => {
    expect(TraceDocumentSchema.safeParse({ ...base, steps: [{ from: "a" }] }).success).toBe(false);
  });

  it("rejects an unknown status", () => {
    const doc = { ...base, steps: [{ from: "a", to: "b", label: "x", status: "weird" }] };
    expect(TraceDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("defaults status to ok when omitted", () => {
    const parsed = TraceDocumentSchema.parse({ ...base, steps: [{ from: "a", to: "b", label: "x" }] });
    expect(parsed.steps[0]!.status).toBe("ok");
  });
});
