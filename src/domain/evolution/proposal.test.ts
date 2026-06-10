import { describe, expect, it } from "vitest";
import {
  ProposalSchema,
  applyRoute,
  canTransition,
  proposalFromInsight,
  type Proposal,
} from "./proposal.ts";
import type { Insight } from "./reflect.ts";

const evidence = {
  events: 4,
  window: "all",
  samples: ["2026-06-09T10:00:00.000Z suggest_rejected"],
};

const skillNote: Proposal = {
  id: "p-2026-06-10-ab12",
  createdAt: "2026-06-10T12:00:00.000Z",
  status: "pending",
  kind: "skill-note",
  summary: "Suggestions were rejected 4 times.",
  evidence,
  payload: { note: "Propose smaller diffs." },
};

describe("ProposalSchema", () => {
  it("accepts a skill-note proposal", () => {
    expect(ProposalSchema.safeParse(skillNote).success).toBe(true);
  });

  it("accepts an update-node proposal", () => {
    const p = {
      ...skillNote,
      kind: "update-node",
      payload: { nodeId: "billing-api", set: { sourcePath: "src/billing" } },
    };
    expect(ProposalSchema.safeParse(p).success).toBe(true);
  });

  it("accepts an add-exception proposal", () => {
    const p = {
      ...skillNote,
      kind: "add-exception",
      payload: { constraintId: "billing-isolation", exceptId: "legacy-sync" },
    };
    expect(ProposalSchema.safeParse(p).success).toBe(true);
  });

  it("rejects a kind/payload mismatch", () => {
    const p = { ...skillNote, kind: "update-node" };
    expect(ProposalSchema.safeParse(p).success).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(
      ProposalSchema.safeParse({ ...skillNote, status: "merged" }).success,
    ).toBe(false);
  });

  it("rejects an empty summary", () => {
    expect(
      ProposalSchema.safeParse({ ...skillNote, summary: "" }).success,
    ).toBe(false);
  });
});

describe("applyRoute", () => {
  it("routes skill-note to the learned overlay", () => {
    expect(applyRoute(skillNote)).toBe("learned-overlay");
  });

  it("routes update-node and add-exception to the suggestion sidecar", () => {
    const updateNode = ProposalSchema.parse({
      ...skillNote,
      kind: "update-node",
      payload: { nodeId: "x", set: { owner: "team-a" } },
    });
    const addException = ProposalSchema.parse({
      ...skillNote,
      kind: "add-exception",
      payload: { constraintId: "c1", exceptId: "n1" },
    });
    expect(applyRoute(updateNode)).toBe("suggestion-sidecar");
    expect(applyRoute(addException)).toBe("suggestion-sidecar");
  });
});

describe("canTransition", () => {
  it.each([
    ["pending", "approved", true],
    ["pending", "rejected", true],
    ["approved", "applied", true],
    ["pending", "applied", false],
    ["rejected", "approved", false],
    ["applied", "pending", false],
    ["approved", "rejected", false],
  ] as const)("%s → %s is %s", (from, to, ok) => {
    expect(canTransition(from, to)).toBe(ok);
  });
});

describe("proposalFromInsight", () => {
  const insight: Insight = {
    heuristic: "rejection-streak",
    summary: "Suggestions were rejected 4 times (1 accepted).",
    proposalKind: "skill-note",
    note: "Propose smaller, more focused diffs.",
    evidence,
  };

  it("builds a pending, schema-valid skill-note proposal", () => {
    const p = proposalFromInsight(insight, "2026-06-10T12:00:00.000Z", "ab12");
    expect(p).toMatchObject({
      id: "p-2026-06-10-ab12",
      status: "pending",
      kind: "skill-note",
      summary: insight.summary,
      payload: { note: insight.note },
    });
    expect(ProposalSchema.safeParse(p).success).toBe(true);
  });
});
