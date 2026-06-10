import { describe, expect, it } from "vitest";
import { buildAffectedReport } from "./affected.ts";
import type { LoadedDoc } from "../io/discovery.ts";
import type { LoadedSeqDoc } from "../io/seq-discovery.ts";
import type { LoadedUseCaseDoc } from "../io/usecase-discovery.ts";
import type { Document } from "./types.ts";
import type { SeqDocument } from "./seq-schema.ts";
import type { UseCaseDocument } from "./usecase-schema.ts";

const arch: Document = {
  version: "1.0",
  name: "Demo",
  nodes: [
    {
      id: "api",
      kind: "service",
      name: "API",
      description: "x",
      sourcePath: "src/api",
    },
    {
      id: "worker",
      kind: "worker",
      name: "Worker",
      description: "x",
      sourcePath: "src/worker",
    },
    { id: "db", kind: "database", name: "DB", description: "x" },
  ],
  edges: [],
};

const seq: SeqDocument = {
  version: "1.0",
  name: "Happy flow",
  participants: [
    { id: "a", nodeId: "api" },
    { id: "d", nodeId: "db" },
  ],
  steps: [
    { type: "message", id: "m1", from: "a", to: "d", label: "write", arrow: "sync" },
  ],
};

const uc: UseCaseDocument = {
  version: "1.0",
  id: "place-order",
  name: "Place order",
  primaryActor: "customer",
  goal: "x",
  flows: { basic: { steps: ["a"] } },
  slices: [
    {
      id: "happy",
      description: "Happy path.",
      flows: ["basic"],
      tests: ["tests/happy.spec.ts"],
      realization: { seqFile: ".archik/flow.archik.seq.yaml" },
    },
    {
      id: "edge",
      description: "Edge case.",
      flows: ["basic"],
      tests: ["tests/edge.spec.ts"],
    },
  ],
};

const archDocs: LoadedDoc[] = [
  { abs: "/p/.archik/main.archik.yaml", relPath: ".archik/main.archik.yaml", doc: arch },
];
const seqDocs: LoadedSeqDoc[] = [
  { abs: "/p/.archik/flow.archik.seq.yaml", relPath: ".archik/flow.archik.seq.yaml", doc: seq },
];
const ucDocs: LoadedUseCaseDoc[] = [
  {
    abs: "/p/.archik/usecases/place-order.archik.uc.yaml",
    relPath: ".archik/usecases/place-order.archik.uc.yaml",
    doc: uc,
  },
];

describe("buildAffectedReport", () => {
  it("maps a changed file under a node sourcePath to that node", () => {
    const report = buildAffectedReport(
      ["src/api/routes.ts"],
      archDocs,
      ucDocs,
      seqDocs,
    );
    expect(report.nodes).toHaveLength(1);
    expect(report.nodes[0]!.id).toBe("api");
    expect(report.nodes[0]!.files).toEqual(["src/api/routes.ts"]);
    expect(report.unmapped).toEqual([]);
  });

  it("does not match sibling directories with a shared prefix", () => {
    const report = buildAffectedReport(
      ["src/api-legacy/x.ts"],
      archDocs,
      ucDocs,
      seqDocs,
    );
    expect(report.nodes).toHaveLength(0);
    expect(report.unmapped).toEqual(["src/api-legacy/x.ts"]);
  });

  it("pulls in slices whose realization seq includes an affected node", () => {
    const report = buildAffectedReport(
      ["src/api/routes.ts"],
      archDocs,
      ucDocs,
      seqDocs,
    );
    expect(report.slices).toHaveLength(1);
    expect(report.slices[0]!.slice).toBe("happy");
    expect(report.slices[0]!.via).toContain("node");
    expect(report.testsToRun).toEqual(["tests/happy.spec.ts"]);
    expect(report.staleSeqs).toHaveLength(1);
    expect(report.staleSeqs[0]!.nodes).toEqual(["api"]);
  });

  it("pulls in slices via a directly-changed test file", () => {
    const report = buildAffectedReport(
      ["tests/edge.spec.ts"],
      archDocs,
      ucDocs,
      seqDocs,
    );
    expect(report.slices).toHaveLength(1);
    expect(report.slices[0]!.slice).toBe("edge");
    expect(report.slices[0]!.via).toEqual(["test"]);
    // A changed test file is mapped (it belongs to a slice), not unmapped.
    expect(report.unmapped).toEqual([]);
  });

  it("pulls in slices via a changed realization seq file", () => {
    const report = buildAffectedReport(
      [".archik/flow.archik.seq.yaml"],
      archDocs,
      ucDocs,
      seqDocs,
    );
    expect(report.slices).toHaveLength(1);
    expect(report.slices[0]!.via).toEqual(["seq"]);
    expect(report.modelFiles).toEqual([".archik/flow.archik.seq.yaml"]);
  });

  it("skips deprecated slices", () => {
    const deprecated: UseCaseDocument = {
      ...uc,
      slices: [{ ...uc.slices[0]!, status: "deprecated" }],
    };
    const report = buildAffectedReport(
      ["src/api/routes.ts"],
      archDocs,
      [{ ...ucDocs[0]!, doc: deprecated }],
      seqDocs,
    );
    expect(report.slices).toHaveLength(0);
  });

  it("matches stale seqs when realization.seqFile carries a ./ prefix", () => {
    const prefixed: UseCaseDocument = {
      ...uc,
      slices: [
        {
          ...uc.slices[0]!,
          realization: { seqFile: "./.archik/flow.archik.seq.yaml" },
        },
      ],
    };
    const report = buildAffectedReport(
      ["src/api/routes.ts"],
      archDocs,
      [{ ...ucDocs[0]!, doc: prefixed }],
      seqDocs,
    );
    expect(report.slices).toHaveLength(1);
    expect(report.slices[0]!.via).toContain("node");
  });

  it("classifies archik model files separately from unmapped code", () => {
    const report = buildAffectedReport(
      [".archik/main.archik.yaml", "docs/readme.md"],
      archDocs,
      ucDocs,
      seqDocs,
    );
    expect(report.modelFiles).toEqual([".archik/main.archik.yaml"]);
    expect(report.unmapped).toEqual(["docs/readme.md"]);
  });

  it("normalises ./ prefixes and backslashes", () => {
    const report = buildAffectedReport(
      ["./src\\api\\routes.ts"],
      archDocs,
      ucDocs,
      seqDocs,
    );
    expect(report.nodes).toHaveLength(1);
    expect(report.nodes[0]!.id).toBe("api");
  });

  it("summarises counts", () => {
    const report = buildAffectedReport(
      ["src/api/a.ts", "src/worker/b.ts", "other.txt"],
      archDocs,
      ucDocs,
      seqDocs,
    );
    expect(report.summary).toEqual({
      changedFiles: 3,
      nodes: 2,
      useCases: 1,
      slices: 1,
      staleSeqs: 1,
      unmapped: 1,
    });
  });
});
