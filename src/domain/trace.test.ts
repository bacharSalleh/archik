import { describe, expect, it } from "vitest";
import { buildTraceMatrix } from "./trace.ts";
import type { LoadedDoc } from "../io/discovery.ts";
import type { LoadedSeqDoc } from "../io/seq-discovery.ts";
import type { LoadedUseCaseDoc } from "../io/usecase-discovery.ts";
import type { Node, Document } from "./types.ts";
import type { SeqDocument } from "./seq-schema.ts";

const arch = (nodes: Node[]): LoadedDoc => ({
  abs: "/abs/main.archik.yaml",
  relPath: "main.archik.yaml",
  doc: {
    version: "1.0",
    name: "Demo",
    nodes,
    edges: [],
  } as Document,
});

const seq = (
  relPath: string,
  name: string,
  participants: Array<{ id: string; nodeId: string }>,
  messageCount = 1,
): LoadedSeqDoc => {
  const steps = [];
  for (let i = 0; i < messageCount; i++) {
    steps.push({
      type: "message" as const,
      id: `m${i}`,
      from: participants[0]?.id ?? "p1",
      to: participants[1]?.id ?? participants[0]?.id ?? "p1",
      label: "x",
      arrow: "sync" as const,
    });
  }
  const doc: SeqDocument = {
    version: "1.0",
    name,
    participants,
    steps,
  };
  return { abs: `/abs/${relPath}`, relPath, doc };
};

const uc = (
  relPath: string,
  id: string,
  slices: Array<{
    id: string;
    description?: string;
    tests?: string[];
    realization?: { seqFile: string };
    status?: "active" | "proposed" | "deprecated";
  }>,
): LoadedUseCaseDoc => ({
  abs: `/abs/${relPath}`,
  relPath,
  doc: {
    version: "1.0",
    id,
    name: id,
    primaryActor: "actor",
    goal: "g",
    flows: { basic: { steps: ["a"] } },
    slices: slices.map((s) => ({
      id: s.id,
      description: s.description ?? "x",
      flows: ["basic"],
      ...(s.tests ? { tests: s.tests } : {}),
      ...(s.realization ? { realization: s.realization } : {}),
      ...(s.status ? { status: s.status } : {}),
    })),
  },
});

describe("buildTraceMatrix", () => {
  it("returns empty rows when there are no use cases", () => {
    const matrix = buildTraceMatrix([], [], []);
    expect(matrix.rows).toHaveLength(0);
    expect(matrix.summary).toEqual({
      useCases: 0,
      slices: 0,
      fullyTraced: 0,
      partial: 0,
      untraced: 0,
    });
  });

  it("classifies a slice with tests + realization + stereotypes as full", () => {
    const archDoc = arch([
      { id: "ui", kind: "frontend", name: "UI", description: "x", stereotype: "boundary" },
      { id: "api", kind: "service", name: "API", description: "x", stereotype: "control" },
    ]);
    const seqDoc = seq("flow.archik.seq.yaml", "Flow", [
      { id: "u", nodeId: "ui" },
      { id: "a", nodeId: "api" },
    ]);
    const ucDoc = uc("uc.archik.uc.yaml", "place-order", [{
      id: "happy",
      tests: ["tests/happy.spec.ts"],
      realization: { seqFile: "flow.archik.seq.yaml" },
    }]);
    const matrix = buildTraceMatrix([ucDoc], [seqDoc], [archDoc]);
    expect(matrix.rows).toHaveLength(1);
    expect(matrix.rows[0]!.level).toBe("full");
    expect(matrix.rows[0]!.coverage.fullyTraced).toBe(true);
    expect(matrix.summary.fullyTraced).toBe(1);
    expect(matrix.rows[0]!.realization?.participants[0]!.stereotype).toBe("boundary");
  });

  it("classifies a slice with tests but no realization as partial", () => {
    const ucDoc = uc("uc.archik.uc.yaml", "place-order", [{
      id: "happy",
      tests: ["tests/happy.spec.ts"],
    }]);
    const matrix = buildTraceMatrix([ucDoc], [], []);
    expect(matrix.rows[0]!.level).toBe("partial");
    expect(matrix.summary.partial).toBe(1);
  });

  it("classifies a slice with realization but no tests as partial", () => {
    const archDoc = arch([
      { id: "ui", kind: "frontend", name: "UI", description: "x" },
    ]);
    const seqDoc = seq("flow.archik.seq.yaml", "Flow", [
      { id: "u", nodeId: "ui" },
    ]);
    const ucDoc = uc("uc.archik.uc.yaml", "x", [{
      id: "happy",
      realization: { seqFile: "flow.archik.seq.yaml" },
    }]);
    const matrix = buildTraceMatrix([ucDoc], [seqDoc], [archDoc]);
    expect(matrix.rows[0]!.level).toBe("partial");
  });

  it("classifies a slice with neither tests nor realization as none", () => {
    const ucDoc = uc("uc.archik.uc.yaml", "x", [{
      id: "happy",
      status: "proposed",
    }]);
    const matrix = buildTraceMatrix([ucDoc], [], []);
    expect(matrix.rows[0]!.level).toBe("none");
    expect(matrix.summary.untraced).toBe(1);
  });

  it("counts messages including those nested inside group branches", () => {
    const archDoc = arch([
      { id: "ui", kind: "frontend", name: "UI", description: "x" },
      { id: "api", kind: "service", name: "API", description: "x" },
    ]);
    const seqDoc: LoadedSeqDoc = {
      abs: "/abs/flow.archik.seq.yaml",
      relPath: "flow.archik.seq.yaml",
      doc: {
        version: "1.0",
        name: "Branched",
        participants: [
          { id: "u", nodeId: "ui" },
          { id: "a", nodeId: "api" },
        ],
        steps: [
          {
            type: "message",
            id: "m0",
            from: "u",
            to: "a",
            label: "x",
            arrow: "sync",
          },
          {
            type: "group",
            id: "g1",
            kind: "alt",
            branches: [
              {
                steps: [{
                  type: "message",
                  id: "m1",
                  from: "a",
                  to: "u",
                  label: "x",
                  arrow: "return",
                }],
              },
              {
                steps: [{
                  type: "message",
                  id: "m2",
                  from: "a",
                  to: "u",
                  label: "y",
                  arrow: "return",
                }],
              },
            ],
          },
        ],
      },
    };
    const ucDoc = uc("uc.archik.uc.yaml", "x", [{
      id: "happy",
      tests: ["t.spec.ts"],
      realization: { seqFile: "flow.archik.seq.yaml" },
    }]);
    const matrix = buildTraceMatrix([ucDoc], [seqDoc], [archDoc]);
    expect(matrix.rows[0]!.realization?.messageCount).toBe(3);
  });

  it("hasStereotypes is false when at least one participant lacks a stereotype", () => {
    const archDoc = arch([
      { id: "ui", kind: "frontend", name: "UI", description: "x", stereotype: "boundary" },
      { id: "api", kind: "service", name: "API", description: "x" }, // no stereotype
    ]);
    const seqDoc = seq("flow.archik.seq.yaml", "Flow", [
      { id: "u", nodeId: "ui" },
      { id: "a", nodeId: "api" },
    ]);
    const ucDoc = uc("uc.archik.uc.yaml", "x", [{
      id: "happy",
      tests: ["t.spec.ts"],
      realization: { seqFile: "flow.archik.seq.yaml" },
    }]);
    const matrix = buildTraceMatrix([ucDoc], [seqDoc], [archDoc]);
    expect(matrix.rows[0]!.coverage.hasStereotypes).toBe(false);
    expect(matrix.rows[0]!.level).toBe("partial");
  });

  it("does not mark a proposed slice as fullyTraced even when everything else is wired", () => {
    const archDoc = arch([
      { id: "ui", kind: "frontend", name: "UI", description: "x", stereotype: "boundary" },
    ]);
    const seqDoc = seq("flow.archik.seq.yaml", "Flow", [
      { id: "u", nodeId: "ui" },
    ]);
    const ucDoc = uc("uc.archik.uc.yaml", "x", [{
      id: "future",
      tests: ["t.spec.ts"],
      realization: { seqFile: "flow.archik.seq.yaml" },
      status: "proposed",
    }]);
    const matrix = buildTraceMatrix([ucDoc], [seqDoc], [archDoc]);
    expect(matrix.rows[0]!.coverage.fullyTraced).toBe(false);
    expect(matrix.rows[0]!.level).toBe("partial");
  });

  it("reports null realization when seq file is referenced but not discovered", () => {
    const ucDoc = uc("uc.archik.uc.yaml", "x", [{
      id: "happy",
      tests: ["t.spec.ts"],
      realization: { seqFile: "ghost.archik.seq.yaml" },
    }]);
    const matrix = buildTraceMatrix([ucDoc], [], []);
    expect(matrix.rows[0]!.realization).toBeNull();
    expect(matrix.rows[0]!.coverage.hasRealization).toBe(false);
  });
});
