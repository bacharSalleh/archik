import { describe, expect, it } from "vitest";
import { SeqDocumentSchema } from "./seq-schema.ts";

const minimalDoc = {
  version: "1.0" as const,
  name: "Login Flow",
  participants: [
    { id: "browser", nodeId: "frontend" },
    { id: "gw", nodeId: "api-gateway" },
  ],
  steps: [
    {
      type: "message" as const,
      id: "m1",
      from: "browser",
      to: "gw",
      label: "POST /auth/login",
      arrow: "sync" as const,
    },
  ],
};

describe("SeqDocumentSchema", () => {
  it("accepts a minimal valid document", () => {
    expect(SeqDocumentSchema.safeParse(minimalDoc).success).toBe(true);
  });
  it("accepts optional description", () => {
    expect(SeqDocumentSchema.safeParse({ ...minimalDoc, description: "A flow" }).success).toBe(true);
  });
  it("rejects missing version", () => {
    const { version: _, ...rest } = minimalDoc;
    expect(SeqDocumentSchema.safeParse(rest).success).toBe(false);
  });
  it("rejects wrong version", () => {
    expect(SeqDocumentSchema.safeParse({ ...minimalDoc, version: "2.0" }).success).toBe(false);
  });
  it("accepts a message with activate and status", () => {
    const doc = {
      ...minimalDoc,
      steps: [{
        type: "message" as const,
        id: "m1",
        from: "browser",
        to: "gw",
        label: "login",
        arrow: "sync" as const,
        activate: true,
        status: "proposed" as const,
      }],
    };
    expect(SeqDocumentSchema.safeParse(doc).success).toBe(true);
  });
  it("rejects a message with invalid arrow type", () => {
    const doc = {
      ...minimalDoc,
      steps: [{ ...minimalDoc.steps[0], arrow: "unicast" }],
    };
    expect(SeqDocumentSchema.safeParse(doc).success).toBe(false);
  });
  it("accepts a note step", () => {
    const doc = {
      ...minimalDoc,
      steps: [{
        type: "note" as const,
        id: "n1",
        position: "over" as const,
        participants: ["browser", "gw"],
        text: "JWT issued here",
      }],
    };
    expect(SeqDocumentSchema.safeParse(doc).success).toBe(true);
  });
  it("accepts an alt group", () => {
    const doc = {
      ...minimalDoc,
      steps: [{
        type: "group" as const,
        id: "g1",
        kind: "alt" as const,
        condition: "[valid]",
        branches: [
          {
            label: "[valid]",
            steps: [{ type: "message" as const, id: "m2", from: "gw", to: "browser", label: "200 OK", arrow: "return" as const }],
          },
        ],
      }],
    };
    expect(SeqDocumentSchema.safeParse(doc).success).toBe(true);
  });
  it("accepts a ref group", () => {
    const doc = {
      ...minimalDoc,
      steps: [{
        type: "group" as const,
        id: "g1",
        kind: "ref" as const,
        label: "See refresh flow",
        seqFile: ".archik/flows/refresh.archik.seq.yaml",
        participants: ["browser", "gw"],
      }],
    };
    expect(SeqDocumentSchema.safeParse(doc).success).toBe(true);
  });
  it("rejects duplicate step ids", () => {
    const doc = {
      ...minimalDoc,
      steps: [
        minimalDoc.steps[0],
        { ...minimalDoc.steps[0] },
      ],
    };
    expect(SeqDocumentSchema.safeParse(doc).success).toBe(false);
  });
  it("rejects duplicate participant ids", () => {
    const doc = {
      ...minimalDoc,
      participants: [
        { id: "browser", nodeId: "frontend" },
        { id: "browser", nodeId: "frontend-v2" },
      ],
    };
    expect(SeqDocumentSchema.safeParse(doc).success).toBe(false);
  });
  it("accepts a self-call (from === to)", () => {
    const doc = {
      ...minimalDoc,
      steps: [{
        type: "message" as const,
        id: "m1",
        from: "browser",
        to: "browser",
        label: "refresh()",
        arrow: "sync" as const,
      }],
    };
    expect(SeqDocumentSchema.safeParse(doc).success).toBe(true);
  });
});
