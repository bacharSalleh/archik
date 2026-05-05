import { describe, expect, it } from "vitest";
import {
  checkSeqEcbRules,
  checkSeqFilePaths,
  checkSeqNodeBackrefs,
  checkSeqNodeRefs,
  checkSeqRealizesIntegrity,
  validateSeqDocument,
} from "./seq-validate.ts";
import type { SeqDocument } from "./seq-schema.ts";
import type { LoadedDoc } from "../io/discovery.ts";
import type { LoadedSeqDoc } from "../io/seq-discovery.ts";
import type { LoadedUseCaseDoc } from "../io/usecase-discovery.ts";
import type { Document, Node } from "./types.ts";

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

describe("checkSeqEcbRules", () => {
  // Helper: an arch doc with three nodes (boundary / control / entity)
  // plus a fourth without a stereotype, for the "skip when missing" check.
  const archWith = (overrides: Array<Partial<Node>> = []): LoadedDoc => {
    const baseNodes: Node[] = [
      { id: "ui", kind: "frontend", name: "UI", description: "x", stereotype: "boundary" },
      { id: "orch", kind: "service", name: "Orch", description: "x", stereotype: "control" },
      { id: "db", kind: "database", name: "DB", description: "x", stereotype: "entity" },
      { id: "untagged", kind: "service", name: "Untagged", description: "x" },
    ];
    return {
      abs: "/abs/main.archik.yaml",
      relPath: "main.archik.yaml",
      doc: {
        version: "1.0",
        name: "Demo",
        nodes: baseNodes.concat(overrides as Node[]),
        edges: [],
      } as Document,
    };
  };

  // Helper: a seq doc with a `realizes` block and one message between
  // two participants whose nodeIds the caller picks.
  const seqOne = (
    fromNodeId: string,
    toNodeId: string,
    arrow: "sync" | "async" | "return" = "sync",
    realizes: { useCase: string; slice: string } | null = {
      useCase: "place-order",
      slice: "happy",
    },
  ): LoadedSeqDoc => ({
    abs: "/abs/x.archik.seq.yaml",
    relPath: ".archik/x.archik.seq.yaml",
    doc: {
      version: "1.0",
      name: "X",
      ...(realizes ? { realizes } : {}),
      participants: [
        { id: "p1", nodeId: fromNodeId },
        { id: "p2", nodeId: toNodeId },
      ],
      steps: [{
        type: "message",
        id: "m1",
        from: "p1",
        to: "p2",
        label: "go",
        arrow,
      }],
    },
  });

  it("ignores seqs without a realizes block", () => {
    const errors = checkSeqEcbRules(
      [seqOne("ui", "db", "sync", null)],
      [archWith()],
    );
    expect(errors).toHaveLength(0);
  });

  it("passes boundary → control", () => {
    expect(checkSeqEcbRules([seqOne("ui", "orch")], [archWith()])).toHaveLength(0);
  });

  it("passes control → entity", () => {
    expect(checkSeqEcbRules([seqOne("orch", "db")], [archWith()])).toHaveLength(0);
  });

  it("passes control → boundary (return path)", () => {
    expect(
      checkSeqEcbRules([seqOne("orch", "ui", "return")], [archWith()]),
    ).toHaveLength(0);
  });

  it("rejects boundary → entity", () => {
    const errors = checkSeqEcbRules([seqOne("ui", "db")], [archWith()]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/boundary → entity is forbidden/);
  });

  it("rejects boundary → boundary", () => {
    const archWith2 = archWith();
    archWith2.doc.nodes.push({
      id: "ui2",
      kind: "frontend",
      name: "UI2",
      description: "x",
      stereotype: "boundary",
    });
    const errors = checkSeqEcbRules([seqOne("ui", "ui2")], [archWith2]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/boundary → boundary/);
  });

  it("rejects entity → boundary", () => {
    const errors = checkSeqEcbRules([seqOne("db", "ui")], [archWith()]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/entity → boundary/);
  });

  it("skips when one endpoint lacks a stereotype (gradual adoption)", () => {
    const errors = checkSeqEcbRules([seqOne("ui", "untagged")], [archWith()]);
    expect(errors).toHaveLength(0);
  });

  it("recurses into group branches", () => {
    const seq: LoadedSeqDoc = {
      abs: "/abs/x.archik.seq.yaml",
      relPath: ".archik/x.archik.seq.yaml",
      doc: {
        version: "1.0",
        name: "Branched",
        realizes: { useCase: "uc", slice: "happy" },
        participants: [
          { id: "p1", nodeId: "ui" },
          { id: "p2", nodeId: "db" },
        ],
        steps: [{
          type: "group",
          id: "g1",
          kind: "alt",
          branches: [{
            label: "[ok]",
            steps: [{
              type: "message",
              id: "m1",
              from: "p1",
              to: "p2",
              label: "go",
              arrow: "sync",
            }],
          }],
        }],
      },
    };
    const errors = checkSeqEcbRules([seq], [archWith()]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/boundary → entity/);
    expect(errors[0]!.path).toMatch(/branches\.0\.steps\.0/);
  });
});

describe("checkSeqNodeBackrefs", () => {
  const seqWith = (
    relPath: string,
    participantNodeIds: string[],
    realizes: { useCase: string; slice: string } | null = {
      useCase: "uc",
      slice: "happy",
    },
  ): LoadedSeqDoc => ({
    abs: `/abs/${relPath}`,
    relPath,
    doc: {
      version: "1.0",
      name: "Flow",
      ...(realizes ? { realizes } : {}),
      participants: participantNodeIds.map((nid, i) => ({
        id: `p${i + 1}`,
        nodeId: nid,
      })),
      steps: [],
    },
  });

  const archWith = (
    nodes: Array<{ id: string; seqFiles?: string[] }>,
  ): LoadedDoc => ({
    abs: "/abs/main.archik.yaml",
    relPath: "main.archik.yaml",
    doc: {
      version: "1.0",
      name: "Demo",
      nodes: nodes.map((n) => ({
        id: n.id,
        kind: "service",
        name: n.id,
        description: "x",
        ...(n.seqFiles ? { seqFiles: n.seqFiles } : {}),
      })) as Node[],
      edges: [],
    } as Document,
  });

  it("returns no errors when every participant node lists the seq", () => {
    const seq = seqWith(".archik/x.archik.seq.yaml", ["a", "b"]);
    const arch = archWith([
      { id: "a", seqFiles: [".archik/x.archik.seq.yaml"] },
      { id: "b", seqFiles: [".archik/x.archik.seq.yaml"] },
    ]);
    expect(checkSeqNodeBackrefs([seq], [arch])).toHaveLength(0);
  });

  it("flags participant nodes that don't list the seq", () => {
    const seq = seqWith(".archik/x.archik.seq.yaml", ["a", "b"]);
    const arch = archWith([
      { id: "a", seqFiles: [".archik/x.archik.seq.yaml"] },
      { id: "b" }, // missing backref
    ]);
    const errors = checkSeqNodeBackrefs([seq], [arch]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('node "b"');
    expect(errors[0]!.message).toContain(".archik/x.archik.seq.yaml");
    expect(errors[0]!.path).toContain("participants.p2");
  });

  it("ignores seqs without a realizes block (ad-hoc / scratch flows)", () => {
    const seq = seqWith(".archik/x.archik.seq.yaml", ["a"], null);
    const arch = archWith([{ id: "a" }]);
    expect(checkSeqNodeBackrefs([seq], [arch])).toHaveLength(0);
  });

  it("skips unknown nodeIds (handled by checkSeqNodeRefs)", () => {
    const seq = seqWith(".archik/x.archik.seq.yaml", ["ghost"]);
    const arch = archWith([{ id: "a" }]);
    expect(checkSeqNodeBackrefs([seq], [arch])).toHaveLength(0);
  });

  it("reports each missing node only once even when aliased", () => {
    const seq: LoadedSeqDoc = {
      abs: "/abs/x.archik.seq.yaml",
      relPath: ".archik/x.archik.seq.yaml",
      doc: {
        version: "1.0",
        name: "Flow",
        realizes: { useCase: "uc", slice: "happy" },
        participants: [
          { id: "p1", nodeId: "a" },
          { id: "p2", nodeId: "a" }, // same node, different alias
        ],
        steps: [],
      },
    };
    const arch = archWith([{ id: "a" }]); // missing backref
    const errors = checkSeqNodeBackrefs([seq], [arch]);
    expect(errors).toHaveLength(1);
  });
});
