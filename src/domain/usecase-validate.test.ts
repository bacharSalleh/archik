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
});

describe("checkUseCaseRealizationPaths", () => {
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

  it("passes when realization seqFile exists in discovered seqs", () => {
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
      [seq(".archik/place-order.archik.seq.yaml")],
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
});
