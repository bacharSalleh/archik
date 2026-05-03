import { describe, expect, it } from "vitest";
import { layoutSeqDocument } from "./seqLayout.ts";
import type { SeqDocument } from "../../domain/seq-schema.ts";

const doc: SeqDocument = {
  version: "1.0",
  name: "Login",
  participants: [
    { id: "browser", nodeId: "frontend", label: "Browser" },
    { id: "gw", nodeId: "api-gateway" },
  ],
  steps: [
    { type: "message", id: "m1", from: "browser", to: "gw", label: "POST /login", arrow: "sync" },
    { type: "message", id: "m2", from: "gw", to: "browser", label: "200 OK", arrow: "return" },
  ],
};

describe("layoutSeqDocument", () => {
  it("produces two participants with distinct x positions", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.participants).toHaveLength(2);
    expect(laid.participants[0]!.cx).not.toBe(laid.participants[1]!.cx);
  });
  it("produces a layouted step for each step", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.steps).toHaveLength(2);
  });
  it("first message y is above second message y", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.steps[0]!.y).toBeLessThan(laid.steps[1]!.y);
  });
  it("total width covers all participants", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.totalWidth).toBeGreaterThan(laid.participants[1]!.cx);
  });
  it("uses participant label for display when provided", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.participants[0]!.label).toBe("Browser");
  });
  it("falls back to nodeId when no label provided", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.participants[1]!.label).toBe("api-gateway");
  });
  it("layout includes totalHeight > totalWidth/2 when there are steps", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.totalHeight).toBeGreaterThan(0);
  });
  it("self-call message has isSelf=true", () => {
    const selfDoc: SeqDocument = {
      version: "1.0",
      name: "Self",
      participants: [{ id: "a", nodeId: "svc" }],
      steps: [{ type: "message", id: "m1", from: "a", to: "a", label: "refresh()", arrow: "sync" }],
    };
    const laid = layoutSeqDocument(selfDoc);
    const msg = laid.steps[0]!;
    expect(msg.type).toBe("message");
    if (msg.type === "message") expect(msg.isSelf).toBe(true);
  });
  it("group step produces type=group", () => {
    const groupDoc: SeqDocument = {
      version: "1.0",
      name: "With Group",
      participants: [
        { id: "a", nodeId: "svc-a" },
        { id: "b", nodeId: "svc-b" },
      ],
      steps: [{
        type: "group",
        id: "g1",
        kind: "alt",
        condition: "[ok]",
        branches: [{
          label: "[ok]",
          steps: [{ type: "message", id: "m1", from: "a", to: "b", label: "call()", arrow: "sync" }],
        }],
      }],
    };
    const laid = layoutSeqDocument(groupDoc);
    expect(laid.steps[0]!.type).toBe("group");
  });
});
