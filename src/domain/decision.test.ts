import { describe, expect, it } from "vitest";
import {
  DecisionSchema,
  formatDecisionRecord,
  nextRecordNumber,
  recordFileName,
  slugify,
} from "./decision.ts";
import type { Document } from "./types.ts";

const decision = {
  context: "Checkout calls the payment provider directly from three places.",
  decision: "Add a payments-port node; checkout talks only to the port.",
  alternatives: ["Keep direct calls", "Wrap the SDK in a shared util"],
  consequences: "One place to swap providers; one more hop in the call path.",
};

describe("DecisionSchema", () => {
  it("accepts a full record", () => {
    expect(DecisionSchema.safeParse(decision).success).toBe(true);
  });

  it("requires at least one alternative", () => {
    expect(DecisionSchema.safeParse({ ...decision, alternatives: [] }).success).toBe(false);
  });

  it.each(["context", "decision", "consequences"] as const)("rejects an empty %s", (key) => {
    expect(DecisionSchema.safeParse({ ...decision, [key]: " " }).success).toBe(false);
  });

  it("accepts supersedes as 4-digit record numbers only", () => {
    expect(DecisionSchema.safeParse({ ...decision, supersedes: ["0003"] }).success).toBe(true);
    expect(DecisionSchema.safeParse({ ...decision, supersedes: ["3"] }).success).toBe(false);
  });
});

describe("slugify / recordFileName / nextRecordNumber", () => {
  it("makes a short kebab slug", () => {
    expect(slugify("Add a Payments port — v2!")).toBe("add-a-payments-port-v2");
    expect(slugify("x".repeat(80))).toHaveLength(50);
    expect(slugify("!!!")).toBe("decision");
  });

  it("pads the record number", () => {
    expect(recordFileName(7, "Add port")).toBe("0007-add-port.md");
  });

  it("continues after the highest existing number", () => {
    expect(nextRecordNumber([])).toBe(1);
    expect(nextRecordNumber(["0001-a.md", "0004-b.md", "README.md", "0002-c.md"])).toBe(5);
  });
});

describe("formatDecisionRecord", () => {
  const before: Document = {
    version: "1.0",
    name: "Shop",
    nodes: [{ id: "checkout", kind: "service", name: "Checkout", description: "x" }],
    edges: [],
  };
  const after: Document = {
    ...before,
    nodes: [
      ...before.nodes,
      { id: "payments-port", kind: "port", name: "Payments port", description: "x" },
    ],
    edges: [{ id: "c-p", from: "checkout", to: "payments-port", relationship: "invokes" }],
  };

  it("renders every section plus the model change as evidence", () => {
    const md = formatDecisionRecord({
      number: 3,
      title: "Put payments behind a port",
      date: "2026-10-17",
      modelFile: ".archik/main.archik.yaml",
      decision: { ...decision, supersedes: ["0001"] },
      before,
      after,
    });
    expect(md).toContain("# 0003. Put payments behind a port");
    expect(md).toContain("- Status: Accepted");
    expect(md).toContain("- Date: 2026-10-17");
    expect(md).toContain("- Supersedes: 0001");
    expect(md).toContain("## Context\n\nCheckout calls");
    expect(md).toContain("## Decision\n\nAdd a payments-port");
    expect(md).toContain("- Keep direct calls\n- Wrap the SDK in a shared util");
    expect(md).toContain("## Consequences\n\nOne place");
    expect(md).toContain("Model change (`.archik/main.archik.yaml`): 1 node added, 1 edge added");
    expect(md).toContain("- added node `payments-port` (port)");
    expect(md).toContain("- added edge `checkout → payments-port` (invokes)");
  });

  it("says when the model did not change", () => {
    const md = formatDecisionRecord({
      number: 1,
      title: "t",
      date: "2026-10-17",
      modelFile: "m.archik.yaml",
      decision,
      before,
      after: before,
    });
    expect(md).toContain("no node or edge changes");
  });
});
