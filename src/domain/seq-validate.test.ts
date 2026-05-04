import { describe, expect, it } from "vitest";
import {
  checkSeqFilePaths,
  checkSeqNodeRefs,
  checkSeqRealizesIntegrity,
  validateSeqDocument,
} from "./seq-validate.ts";
import type { SeqDocument } from "./seq-schema.ts";
import type { LoadedSeqDoc } from "../io/seq-discovery.ts";
import type { LoadedUseCaseDoc } from "../io/usecase-discovery.ts";

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

describe("checkSeqRealizesIntegrity", () => {
  const seqWith = (
    relPath: string,
    realizes?: { useCase: string; slice: string },
  ): LoadedSeqDoc => ({
    abs: `/abs/${relPath}`,
    relPath,
    doc: {
      version: "1.0",
      name: "Flow",
      ...(realizes ? { realizes } : {}),
      participants: [{ id: "p", nodeId: "n" }],
      steps: [],
    },
  });

  const ucWith = (
    relPath: string,
    id: string,
    slices: Array<{ id: string; realization?: { seqFile: string } }>,
  ): LoadedUseCaseDoc => ({
    abs: `/abs/${relPath}`,
    relPath,
    doc: {
      version: "1.0",
      id,
      name: "UC",
      primaryActor: "actor",
      goal: "goal",
      flows: { basic: { steps: ["a"] } },
      slices: slices.map((s) => ({
        id: s.id,
        description: "x",
        flows: ["basic"],
        tests: ["t.spec.ts"],
        ...(s.realization ? { realization: s.realization } : {}),
      })),
    },
  });

  it("ignores seq files without a realizes block", () => {
    const errors = checkSeqRealizesIntegrity(
      [seqWith(".archik/x.archik.seq.yaml")],
      [ucWith(".archik/usecases/x.archik.uc.yaml", "x", [{ id: "happy" }])],
    );
    expect(errors).toHaveLength(0);
  });

  it("passes when both sides agree", () => {
    const seqRel = ".archik/place-order.archik.seq.yaml";
    const errors = checkSeqRealizesIntegrity(
      [seqWith(seqRel, { useCase: "place-order", slice: "happy" })],
      [ucWith(".archik/usecases/place-order.archik.uc.yaml", "place-order", [
        { id: "happy", realization: { seqFile: seqRel } },
      ])],
    );
    expect(errors).toHaveLength(0);
  });

  it("reports unknown use case", () => {
    const errors = checkSeqRealizesIntegrity(
      [seqWith(".archik/x.archik.seq.yaml", { useCase: "ghost", slice: "a" })],
      [],
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/no such use case file was found/);
  });

  it("reports unknown slice within a known use case", () => {
    const errors = checkSeqRealizesIntegrity(
      [seqWith(".archik/x.archik.seq.yaml", {
        useCase: "place-order",
        slice: "ghost",
      })],
      [ucWith(".archik/usecases/place-order.archik.uc.yaml", "place-order", [
        { id: "happy" },
      ])],
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/no slice with that id/);
  });

  it("reports a slice that doesn't declare realization.seqFile", () => {
    const errors = checkSeqRealizesIntegrity(
      [seqWith(".archik/x.archik.seq.yaml", {
        useCase: "place-order",
        slice: "happy",
      })],
      [ucWith(".archik/usecases/place-order.archik.uc.yaml", "place-order", [
        { id: "happy" },
      ])],
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/does not declare/);
  });

  it("reports a mismatched seqFile pointer (one-way claim)", () => {
    const errors = checkSeqRealizesIntegrity(
      [seqWith(".archik/A.archik.seq.yaml", {
        useCase: "place-order",
        slice: "happy",
      })],
      [ucWith(".archik/usecases/place-order.archik.uc.yaml", "place-order", [
        { id: "happy", realization: { seqFile: ".archik/B.archik.seq.yaml" } },
      ])],
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/Pick one canonical seq file/);
  });
});
