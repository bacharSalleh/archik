import { describe, expect, it } from "vitest";
import {
  evaluateAlphaState,
  hasCheck,
  type AlphaCheckContext,
} from "./alpha-checks.ts";
import type { LoadedDoc } from "../io/discovery.ts";
import type { LoadedActorDoc } from "../io/actor-discovery.ts";
import type { LoadedSeqDoc } from "../io/seq-discovery.ts";
import type { LoadedUseCaseDoc } from "../io/usecase-discovery.ts";
import type { Document, Node } from "./types.ts";

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

const actor = (
  ids: Array<{ id: string; kind: "human" | "external-system" }>,
): LoadedActorDoc => ({
  abs: "/abs/actors.archik.actors.yaml",
  relPath: "actors.archik.actors.yaml",
  doc: {
    version: "1.0",
    actors: ids.map((a) => ({
      id: a.id,
      kind: a.kind,
      description: `${a.id} description`,
    })),
  },
});

const uc = (
  id: string,
  slices: Array<{
    id: string;
    tests?: string[];
    realization?: { seqFile: string };
    status?: "active" | "proposed" | "deprecated";
  }>,
): LoadedUseCaseDoc => ({
  abs: `/abs/${id}.archik.uc.yaml`,
  relPath: `${id}.archik.uc.yaml`,
  doc: {
    version: "1.0",
    id,
    name: id,
    primaryActor: "actor",
    goal: "g",
    flows: { basic: { steps: ["a"] } },
    slices: slices.map((s) => ({
      id: s.id,
      description: "x",
      flows: ["basic"],
      ...(s.tests ? { tests: s.tests } : {}),
      ...(s.realization ? { realization: s.realization } : {}),
      ...(s.status ? { status: s.status } : {}),
    })),
  },
});

const seq = (relPath: string): LoadedSeqDoc => ({
  abs: `/abs/${relPath}`,
  relPath,
  doc: {
    version: "1.0",
    name: "Flow",
    participants: [{ id: "p", nodeId: "n" }],
    steps: [],
  },
});

const ctx = (overrides: Partial<AlphaCheckContext> = {}): AlphaCheckContext => ({
  archDocs: [],
  ucDocs: [],
  seqDocs: [],
  actorDocs: [],
  fileExists: () => true,
  ...overrides,
});

describe("hasCheck", () => {
  it("returns true for machine-checkable states", () => {
    expect(hasCheck("requirements", "acceptable")).toBe(true);
    expect(hasCheck("softwareSystem", "ready")).toBe(true);
  });
  it("returns false for subjective states", () => {
    expect(hasCheck("stakeholders", "in-agreement")).toBe(false);
    expect(hasCheck("requirements", "fulfilled")).toBe(false);
  });
});

describe("evaluateAlphaState — stakeholders", () => {
  it("recognised: passes when there are actors", () => {
    expect(
      evaluateAlphaState("stakeholders", "recognised", ctx({
        actorDocs: [actor([{ id: "customer", kind: "human" }])],
      })),
    ).toEqual({ ok: true });
  });
  it("recognised: fails when there are no actors", () => {
    const r = evaluateAlphaState("stakeholders", "recognised", ctx());
    expect(r).not.toBeNull();
    expect((r as { ok: boolean }).ok).toBe(false);
  });
  it("represented: requires a human actor", () => {
    const onlyExternals = evaluateAlphaState("stakeholders", "represented", ctx({
      actorDocs: [actor([{ id: "stripe", kind: "external-system" }])],
    }));
    expect((onlyExternals as { ok: boolean }).ok).toBe(false);
    const withHuman = evaluateAlphaState("stakeholders", "represented", ctx({
      actorDocs: [actor([{ id: "customer", kind: "human" }])],
    }));
    expect(withHuman).toEqual({ ok: true });
  });
  it("involved: subjective (returns null)", () => {
    expect(evaluateAlphaState("stakeholders", "involved", ctx())).toBeNull();
  });
});

describe("evaluateAlphaState — requirements", () => {
  it("bounded: passes when all primaryActors resolve against actor docs", () => {
    const ucDoc = uc("place-order", [{ id: "happy", tests: ["t.spec"] }]);
    const actorDoc = actor([{ id: "actor", kind: "human" }]);
    expect(
      evaluateAlphaState("requirements", "bounded", ctx({
        ucDocs: [ucDoc],
        actorDocs: [actorDoc],
      })),
    ).toEqual({ ok: true });
  });

  it("bounded: fails when a UC primaryActor is not in any actor file", () => {
    const ucDoc = uc("place-order", [{ id: "happy", tests: ["t.spec"] }]);
    // uc() sets primaryActor: "actor" — no actor docs at all
    const r = evaluateAlphaState("requirements", "bounded", ctx({
      ucDocs: [ucDoc],
      actorDocs: [],
    }));
    expect(r).toMatchObject({ ok: false });
    expect((r as { ok: false; reason: string }).reason).toMatch(/primaryActor/);
  });

  it("bounded: fails when no use cases exist", () => {
    expect(
      evaluateAlphaState("requirements", "bounded", ctx()),
    ).toMatchObject({ ok: false });
  });

  it("coherent: passes when all UC IDs are unique", () => {
    expect(
      evaluateAlphaState("requirements", "coherent", ctx({
        ucDocs: [
          uc("place-order", [{ id: "happy", tests: ["t.spec"] }]),
          uc("cancel-order", [{ id: "happy", tests: ["t.spec"] }]),
        ],
      })),
    ).toEqual({ ok: true });
  });

  it("coherent: fails when two UC files share the same id", () => {
    const ucA: LoadedUseCaseDoc = {
      abs: "/abs/a/place-order.archik.uc.yaml",
      relPath: "a/place-order.archik.uc.yaml",
      doc: uc("place-order", [{ id: "happy", tests: ["t.spec"] }]).doc,
    };
    const ucB: LoadedUseCaseDoc = {
      abs: "/abs/b/place-order.archik.uc.yaml",
      relPath: "b/place-order.archik.uc.yaml",
      doc: uc("place-order", [{ id: "sad", tests: ["t.spec"] }]).doc,
    };
    const r = evaluateAlphaState("requirements", "coherent", ctx({
      ucDocs: [ucA, ucB],
    }));
    expect(r).toMatchObject({ ok: false });
    expect((r as { ok: false; reason: string }).reason).toMatch(/place-order/);
  });

  it("coherent: fails when no use cases exist", () => {
    expect(
      evaluateAlphaState("requirements", "coherent", ctx()),
    ).toMatchObject({ ok: false });
  });

  it("conceived: requires ≥ 1 use case", () => {
    expect(
      evaluateAlphaState("requirements", "conceived", ctx({
        ucDocs: [uc("place-order", [{ id: "happy", tests: ["t.spec"] }])],
      })),
    ).toEqual({ ok: true });
    expect(
      evaluateAlphaState("requirements", "conceived", ctx()),
    ).toMatchObject({ ok: false });
  });
  it("acceptable: every active slice needs tests on disk", () => {
    const ucDoc = uc("place-order", [
      { id: "happy", tests: ["tests/happy.spec.ts"] },
    ]);
    expect(
      evaluateAlphaState("requirements", "acceptable", ctx({
        ucDocs: [ucDoc],
        fileExists: () => true,
      })),
    ).toEqual({ ok: true });
    expect(
      evaluateAlphaState("requirements", "acceptable", ctx({
        ucDocs: [ucDoc],
        fileExists: () => false,
      })),
    ).toMatchObject({ ok: false });
  });
  it("acceptable: skips proposed slices", () => {
    const ucDoc = uc("place-order", [
      { id: "future", status: "proposed" }, // no tests fine on proposed
    ]);
    expect(
      evaluateAlphaState("requirements", "acceptable", ctx({ ucDocs: [ucDoc] })),
    ).toEqual({ ok: true });
  });
  it("addressed: every active slice needs a discovered realization seq", () => {
    const ucDoc = uc("place-order", [
      {
        id: "happy",
        tests: ["t.spec"],
        realization: { seqFile: ".archik/flow.archik.seq.yaml" },
      },
    ]);
    const withSeq = evaluateAlphaState("requirements", "addressed", ctx({
      ucDocs: [ucDoc],
      seqDocs: [seq(".archik/flow.archik.seq.yaml")],
    }));
    expect(withSeq).toEqual({ ok: true });
    const without = evaluateAlphaState("requirements", "addressed", ctx({
      ucDocs: [ucDoc],
      seqDocs: [],
    }));
    expect(without).toMatchObject({ ok: false });
  });
});

describe("evaluateAlphaState — softwareSystem", () => {
  it("architecture-selected: requires ≥ 1 node across docs", () => {
    expect(
      evaluateAlphaState("softwareSystem", "architecture-selected", ctx({
        archDocs: [arch([
          { id: "api", kind: "service", name: "API", description: "x", sourcePath: "src/api" },
        ])],
      })),
    ).toEqual({ ok: true });
    expect(
      evaluateAlphaState("softwareSystem", "architecture-selected", ctx({
        archDocs: [arch([])],
      })),
    ).toMatchObject({ ok: false });
  });
  it("demonstrable: every active code-bearing node has on-disk sourcePath", () => {
    const node: Node = {
      id: "api",
      kind: "service",
      name: "API",
      description: "x",
      sourcePath: "src/api",
    };
    expect(
      evaluateAlphaState("softwareSystem", "demonstrable", ctx({
        archDocs: [arch([node])],
        fileExists: () => true,
      })),
    ).toEqual({ ok: true });
    expect(
      evaluateAlphaState("softwareSystem", "demonstrable", ctx({
        archDocs: [arch([node])],
        fileExists: () => false,
      })),
    ).toMatchObject({ ok: false });
  });
  it("demonstrable: ignores proposed/deprecated nodes", () => {
    const proposedNode: Node = {
      id: "future",
      kind: "service",
      name: "Future",
      description: "x",
      status: "proposed",
    };
    expect(
      evaluateAlphaState("softwareSystem", "demonstrable", ctx({
        archDocs: [arch([proposedNode])],
        fileExists: () => false,
      })),
    ).toEqual({ ok: true });
  });
  it("usable: passes when all active slices have on-disk tests", () => {
    const ucDoc = uc("place-order", [
      { id: "happy", tests: ["tests/happy.spec.ts"] },
    ]);
    expect(
      evaluateAlphaState("softwareSystem", "usable", ctx({
        ucDocs: [ucDoc],
        fileExists: () => true,
      })),
    ).toEqual({ ok: true });
  });
  it("usable: fails when an active slice has no tests on disk", () => {
    const ucDoc = uc("place-order", [
      { id: "happy", tests: ["tests/happy.spec.ts"] },
    ]);
    const r = evaluateAlphaState("softwareSystem", "usable", ctx({
      ucDocs: [ucDoc],
      fileExists: () => false,
    }));
    expect(r).toMatchObject({ ok: false });
    expect((r as { ok: false; reason: string }).reason).toMatch(/test/i);
  });
  it("usable: fails when no use cases are defined", () => {
    const r = evaluateAlphaState("softwareSystem", "usable", ctx());
    expect(r).toMatchObject({ ok: false });
  });
  it("usable: skips proposed slices (no tests required yet)", () => {
    const ucDoc = uc("place-order", [
      { id: "future", status: "proposed" },
    ]);
    expect(
      evaluateAlphaState("softwareSystem", "usable", ctx({ ucDocs: [ucDoc] })),
    ).toEqual({ ok: true });
  });
  it("ready: every active slice must be `level: full` in the trace matrix", () => {
    const archDoc = arch([
      { id: "ui", kind: "frontend", name: "UI", description: "x", sourcePath: "src/ui", stereotype: "boundary" },
      { id: "api", kind: "service", name: "API", description: "x", sourcePath: "src/api", stereotype: "control" },
    ]);
    const ucDoc = uc("place-order", [
      {
        id: "happy",
        tests: ["t.spec"],
        realization: { seqFile: "flow.archik.seq.yaml" },
      },
    ]);
    const seqDoc: LoadedSeqDoc = {
      abs: "/abs/flow.archik.seq.yaml",
      relPath: "flow.archik.seq.yaml",
      doc: {
        version: "1.0",
        name: "Flow",
        participants: [
          { id: "u", nodeId: "ui" },
          { id: "a", nodeId: "api" },
        ],
        steps: [],
      },
    };
    expect(
      evaluateAlphaState("softwareSystem", "ready", ctx({
        archDocs: [archDoc],
        ucDocs: [ucDoc],
        seqDocs: [seqDoc],
      })),
    ).toEqual({ ok: true });
  });
  it("ready: fails when an active slice is partial", () => {
    const archDoc = arch([
      { id: "api", kind: "service", name: "API", description: "x", sourcePath: "src/api" },
    ]);
    const ucDoc = uc("place-order", [{ id: "happy", tests: ["t.spec"] }]);
    const r = evaluateAlphaState("softwareSystem", "ready", ctx({
      archDocs: [archDoc],
      ucDocs: [ucDoc],
    }));
    expect(r).toMatchObject({ ok: false });
  });
});

describe("evaluateAlphaState — work", () => {
  it("initiated: always ok (the existence of the alphas file is the proof)", () => {
    expect(evaluateAlphaState("work", "initiated", ctx())).toEqual({ ok: true });
  });
  it("started: requires ≥ 1 active slice across use cases", () => {
    const ucActive = uc("x", [{ id: "happy", tests: ["t.spec"] }]);
    const ucProposed = uc("y", [{ id: "future", status: "proposed" }]);
    expect(
      evaluateAlphaState("work", "started", ctx({ ucDocs: [ucActive] })),
    ).toEqual({ ok: true });
    expect(
      evaluateAlphaState("work", "started", ctx({ ucDocs: [ucProposed] })),
    ).toMatchObject({ ok: false });
  });
  it("under-control: subjective (returns null) — no machine check", () => {
    // The previous implementation rubber-stamped the claim by checking
    // archDocs.length > 0, which doesn't actually verify "under control"
    // (validate green, drift clean, tests passing). Demoted to subjective
    // so the canvas badge says "?" rather than a misleading ✓.
    expect(evaluateAlphaState("work", "under-control", ctx())).toBeNull();
    expect(
      evaluateAlphaState("work", "under-control", ctx({ archDocs: [arch([])] })),
    ).toBeNull();
  });
});

describe("evaluateAlphaState — unknown state", () => {
  it("returns a failure for an unknown state", () => {
    const r = evaluateAlphaState("requirements", "ghost", ctx());
    expect(r).toMatchObject({ ok: false });
  });
});
