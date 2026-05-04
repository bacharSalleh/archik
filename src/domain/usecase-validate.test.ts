import { describe, expect, it } from "vitest";
import type { LoadedActorDoc } from "../io/actor-discovery.ts";
import type { LoadedUseCaseDoc } from "../io/usecase-discovery.ts";
import type { LoadedSeqDoc } from "../io/seq-discovery.ts";
import {
  buildActorIndex,
  buildUseCaseIndex,
  checkUseCaseActorRefs,
  checkUseCaseRealizationPaths,
  checkUseCaseTestPaths,
} from "./usecase-validate.ts";

const actorDoc = (relPath: string, ids: string[]): LoadedActorDoc => ({
  abs: `/abs/${relPath}`,
  relPath,
  doc: {
    version: "1.0",
    actors: ids.map((id) => ({
      id,
      kind: "human",
      description: `${id} description`,
    })),
  },
});

const ucDoc = (
  relPath: string,
  overrides: Partial<LoadedUseCaseDoc["doc"]> = {},
): LoadedUseCaseDoc => ({
  abs: `/abs/${relPath}`,
  relPath,
  doc: {
    version: "1.0",
    id: "place-order",
    name: "Place an order",
    primaryActor: "customer",
    goal: "Customer pays.",
    flows: { basic: { steps: ["a"] } },
    slices: [{
      id: "happy-path",
      description: "Happy.",
      flows: ["basic"],
      tests: ["tests/happy.spec.ts"],
    }],
    ...overrides,
  },
});

describe("buildActorIndex", () => {
  it("builds an index across multiple files", () => {
    const result = buildActorIndex([
      actorDoc(".archik/people.archik.actors.yaml", ["customer", "admin"]),
      actorDoc(".archik/systems.archik.actors.yaml", ["stripe"]),
    ]);
    expect(result.errors).toHaveLength(0);
    expect(result.index.size).toBe(3);
    expect(result.index.get("customer")?.relPath).toBe(".archik/people.archik.actors.yaml");
  });

  it("reports duplicate actor ids across files", () => {
    const result = buildActorIndex([
      actorDoc(".archik/a.archik.actors.yaml", ["customer"]),
      actorDoc(".archik/b.archik.actors.yaml", ["customer"]),
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toMatch(/duplicated across actor files/);
  });
});

describe("buildUseCaseIndex", () => {
  it("builds the use case index", () => {
    const result = buildUseCaseIndex([
      ucDoc(".archik/usecases/place-order.archik.uc.yaml"),
    ]);
    expect(result.errors).toHaveLength(0);
    expect(result.index.has("place-order")).toBe(true);
  });

  it("reports duplicate use case ids", () => {
    const result = buildUseCaseIndex([
      ucDoc(".archik/usecases/a.archik.uc.yaml", { id: "place-order" }),
      ucDoc(".archik/usecases/b.archik.uc.yaml", { id: "place-order" }),
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toMatch(/duplicated across files/);
  });
});

describe("checkUseCaseActorRefs", () => {
  it("passes when every actor ref resolves", () => {
    const actorIndex = buildActorIndex([
      actorDoc(".archik/a.archik.actors.yaml", ["customer", "stripe"]),
    ]).index;
    const errors = checkUseCaseActorRefs(
      [ucDoc(".archik/usecases/x.archik.uc.yaml", {
        secondaryActors: ["stripe"],
      })],
      actorIndex,
    );
    expect(errors).toHaveLength(0);
  });

  it("reports unknown primaryActor", () => {
    const actorIndex = buildActorIndex([
      actorDoc(".archik/a.archik.actors.yaml", ["admin"]),
    ]).index;
    const errors = checkUseCaseActorRefs(
      [ucDoc(".archik/usecases/x.archik.uc.yaml")],
      actorIndex,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/unknown primaryActor/);
  });

  it("reports unknown secondary actor", () => {
    const actorIndex = buildActorIndex([
      actorDoc(".archik/a.archik.actors.yaml", ["customer"]),
    ]).index;
    const errors = checkUseCaseActorRefs(
      [ucDoc(".archik/usecases/x.archik.uc.yaml", {
        secondaryActors: ["ghost"],
      })],
      actorIndex,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/unknown secondary actor "ghost"/);
  });
});

describe("checkUseCaseTestPaths", () => {
  it("passes when every test exists", () => {
    const errors = checkUseCaseTestPaths(
      [ucDoc(".archik/usecases/x.archik.uc.yaml")],
      () => true,
    );
    expect(errors).toHaveLength(0);
  });

  it("reports missing test file", () => {
    const errors = checkUseCaseTestPaths(
      [ucDoc(".archik/usecases/x.archik.uc.yaml")],
      () => false,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/does not exist on disk/);
  });

  it("skips slices without tests array (proposed slices)", () => {
    const errors = checkUseCaseTestPaths(
      [ucDoc(".archik/usecases/x.archik.uc.yaml", {
        slices: [{
          id: "happy-path",
          description: "Future work.",
          flows: ["basic"],
          status: "proposed",
        }],
      })],
      () => false,
    );
    expect(errors).toHaveLength(0);
  });

  it("skips test existence checks for proposed slices even when tests are listed (M6 fix H3)", () => {
    // Proposed slices may sketch tests that haven't been written yet —
    // skip the on-disk existence pass to mirror the sourcePath rule.
    const errors = checkUseCaseTestPaths(
      [ucDoc(".archik/usecases/x.archik.uc.yaml", {
        slices: [{
          id: "future",
          description: "Sketch.",
          flows: ["basic"],
          tests: ["tests/not-yet-written.spec.ts"],
          status: "proposed",
        }],
      })],
      () => false,
    );
    expect(errors).toHaveLength(0);
  });

  it("skips test existence checks for deprecated slices too (M6 fix H3)", () => {
    const errors = checkUseCaseTestPaths(
      [ucDoc(".archik/usecases/x.archik.uc.yaml", {
        slices: [{
          id: "old",
          description: "Removed flow.",
          flows: ["basic"],
          tests: ["tests/already-deleted.spec.ts"],
          status: "deprecated",
        }],
      })],
      () => false,
    );
    expect(errors).toHaveLength(0);
  });
});

describe("checkUseCaseRealizationPaths", () => {
  const seq = (
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

  it("passes when realization seqFile exists AND seq's realizes points back", () => {
    const errors = checkUseCaseRealizationPaths(
      [ucDoc(".archik/usecases/x.archik.uc.yaml", {
        slices: [{
          id: "happy-path",
          description: "Happy.",
          flows: ["basic"],
          tests: ["tests/happy.spec.ts"],
          realization: { seqFile: ".archik/place-order.archik.seq.yaml" },
        }],
      })],
      [seq(".archik/place-order.archik.seq.yaml", {
        useCase: "place-order",
        slice: "happy-path",
      })],
    );
    expect(errors).toHaveLength(0);
  });

  it("reports missing seq file", () => {
    const errors = checkUseCaseRealizationPaths(
      [ucDoc(".archik/usecases/x.archik.uc.yaml", {
        slices: [{
          id: "happy-path",
          description: "Happy.",
          flows: ["basic"],
          tests: ["tests/happy.spec.ts"],
          realization: { seqFile: ".archik/ghost.archik.seq.yaml" },
        }],
      })],
      [],
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/does not exist or did not parse/);
  });

  it("rejects a realization pointing at a seq with NO realizes block", () => {
    // The case the seq-side check can't catch — a slice claims a seq
    // that has no realizes block at all. UC-side bidirectional pass
    // closes the loop.
    const errors = checkUseCaseRealizationPaths(
      [ucDoc(".archik/usecases/x.archik.uc.yaml", {
        slices: [{
          id: "happy-path",
          description: "Happy.",
          flows: ["basic"],
          tests: ["tests/happy.spec.ts"],
          realization: { seqFile: ".archik/orphan.archik.seq.yaml" },
        }],
      })],
      [seq(".archik/orphan.archik.seq.yaml")],
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/no `realizes` block/);
  });

  it("rejects a realization pointing at a seq whose realizes points elsewhere", () => {
    const errors = checkUseCaseRealizationPaths(
      [ucDoc(".archik/usecases/x.archik.uc.yaml", {
        slices: [{
          id: "happy-path",
          description: "Happy.",
          flows: ["basic"],
          tests: ["tests/happy.spec.ts"],
          realization: { seqFile: ".archik/wrong.archik.seq.yaml" },
        }],
      })],
      [seq(".archik/wrong.archik.seq.yaml", {
        useCase: "other-case",
        slice: "other-slice",
      })],
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/Pick one canonical link/);
  });
});
