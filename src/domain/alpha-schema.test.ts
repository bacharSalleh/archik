import { describe, expect, it } from "vitest";
import {
  AlphaDocumentSchema,
  REQUIREMENTS_STATES,
  STAKEHOLDERS_STATES,
  SOFTWARE_SYSTEM_STATES,
  WORK_STATES,
  stateIndex,
} from "./alpha-schema.ts";

describe("AlphaDocumentSchema", () => {
  it("accepts an empty alphas block", () => {
    const result = AlphaDocumentSchema.safeParse({
      version: "1.0",
      alphas: {},
    });
    expect(result.success).toBe(true);
  });

  it("accepts a fully populated document", () => {
    const result = AlphaDocumentSchema.safeParse({
      version: "1.0",
      description: "Project alpha snapshot.",
      alphas: {
        stakeholders: { state: "represented" },
        requirements: { state: "acceptable", note: "Tests in place" },
        softwareSystem: {
          state: "usable",
          evidence: ["validate clean", "drift clean"],
        },
        work: { state: "under-control" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown state for an alpha", () => {
    const result = AlphaDocumentSchema.safeParse({
      version: "1.0",
      alphas: { requirements: { state: "splendid" } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown alpha names", () => {
    const result = AlphaDocumentSchema.safeParse({
      version: "1.0",
      alphas: { team: { state: "performing" } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty evidence strings", () => {
    const result = AlphaDocumentSchema.safeParse({
      version: "1.0",
      alphas: { requirements: { state: "bounded", evidence: [""] } },
    });
    expect(result.success).toBe(false);
  });
});

describe("STATE_LADDERS / stateIndex", () => {
  it("orders stakeholders states", () => {
    expect(STAKEHOLDERS_STATES[0]).toBe("recognised");
    expect(STAKEHOLDERS_STATES[STAKEHOLDERS_STATES.length - 1]).toBe(
      "satisfied-in-use",
    );
  });

  it("orders requirements states", () => {
    expect(REQUIREMENTS_STATES[0]).toBe("conceived");
    expect(REQUIREMENTS_STATES[REQUIREMENTS_STATES.length - 1]).toBe(
      "fulfilled",
    );
  });

  it("orders softwareSystem states", () => {
    expect(SOFTWARE_SYSTEM_STATES[0]).toBe("architecture-selected");
    expect(SOFTWARE_SYSTEM_STATES[SOFTWARE_SYSTEM_STATES.length - 1]).toBe(
      "retired",
    );
  });

  it("orders work states", () => {
    expect(WORK_STATES[0]).toBe("initiated");
    expect(WORK_STATES[WORK_STATES.length - 1]).toBe("closed");
  });

  it("stateIndex returns -1 for unknown states", () => {
    expect(stateIndex("requirements", "ghost")).toBe(-1);
  });

  it("stateIndex returns the position for known states", () => {
    expect(stateIndex("requirements", "conceived")).toBe(0);
    expect(stateIndex("requirements", "addressed")).toBe(4);
  });
});
