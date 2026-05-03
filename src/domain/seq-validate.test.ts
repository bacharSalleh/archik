import { describe, expect, it } from "vitest";
import {
  checkSeqNodeRefs,
  checkSeqFilePaths,
  validateSeqDocument,
} from "./seq-validate.ts";
import type { SeqDocument } from "./seq-schema.ts";

const knownNodeIds = new Set(["frontend", "api-gateway", "auth-service"]);

const validDoc: SeqDocument = {
  version: "1.0",
  name: "Login Flow",
  participants: [
    { id: "browser", nodeId: "frontend" },
    { id: "gw", nodeId: "api-gateway" },
  ],
  steps: [
    { type: "message", id: "m1", from: "browser", to: "gw", label: "login", arrow: "sync" },
  ],
};

describe("validateSeqDocument", () => {
  it("returns ok for a valid document", () => {
    const result = validateSeqDocument(validDoc);
    expect(result.ok).toBe(true);
  });
  it("returns errors for missing name", () => {
    const result = validateSeqDocument({ ...validDoc, name: "" });
    expect(result.ok).toBe(false);
  });
});

describe("checkSeqNodeRefs", () => {
  it("returns no errors when all nodeIds are known", () => {
    expect(checkSeqNodeRefs(validDoc, knownNodeIds)).toHaveLength(0);
  });
  it("returns error for unknown nodeId", () => {
    const doc: SeqDocument = {
      ...validDoc,
      participants: [{ id: "browser", nodeId: "nonexistent-node" }],
      steps: [],
    };
    const errors = checkSeqNodeRefs(doc, knownNodeIds);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("nonexistent-node");
  });
  it("returns error for message from unknown participant", () => {
    const doc: SeqDocument = {
      ...validDoc,
      steps: [{ type: "message", id: "m1", from: "unknown-p", to: "gw", label: "x", arrow: "sync" }],
    };
    const errors = checkSeqNodeRefs(doc, knownNodeIds);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("unknown-p");
  });
  it("returns error for note referencing unknown participant", () => {
    const doc: SeqDocument = {
      ...validDoc,
      steps: [{
        type: "note",
        id: "n1",
        position: "over",
        participants: ["browser", "unknown-p"],
        text: "hi",
      }],
    };
    const errors = checkSeqNodeRefs(doc, knownNodeIds);
    expect(errors.some((e) => e.message.includes("unknown-p"))).toBe(true);
  });
  it("validates message participants inside groups recursively", () => {
    const doc: SeqDocument = {
      ...validDoc,
      steps: [{
        type: "group",
        id: "g1",
        kind: "alt",
        branches: [{
          label: "[ok]",
          steps: [{ type: "message", id: "m2", from: "bad-p", to: "gw", label: "x", arrow: "sync" }],
        }],
      }],
    };
    const errors = checkSeqNodeRefs(doc, knownNodeIds);
    expect(errors.some((e) => e.message.includes("bad-p"))).toBe(true);
  });
});

describe("checkSeqFilePaths", () => {
  it("returns no errors when all paths exist", () => {
    const errors = checkSeqFilePaths(
      [".archik/flows/login.archik.seq.yaml"],
      (p) => p === ".archik/flows/login.archik.seq.yaml",
    );
    expect(errors).toHaveLength(0);
  });
  it("returns error when path does not exist", () => {
    const errors = checkSeqFilePaths(
      [".archik/flows/missing.archik.seq.yaml"],
      () => false,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("missing.archik.seq.yaml");
  });
});
