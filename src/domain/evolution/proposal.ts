import { z } from "zod";
import type { Insight } from "./reflect.ts";

/**
 * Evolution loop — Propose / Validate / Apply stages.
 *
 * A proposal is one human-readable upgrade the system suggests for
 * itself. Proposals live as YAML files in .archik/evolution/proposals/
 * so they can be read, reviewed, and audited like any other archik
 * artifact. Nothing is ever applied without an explicit approve
 * (the Sidecar Approval Gate principle).
 */

export const PROPOSAL_KINDS = [
  "skill-note",
  "update-node",
  "add-exception",
] as const;

export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export const PROPOSAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "applied",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

const EvidenceSchema = z.object({
  events: z.number().int(),
  window: z.string(),
  samples: z.array(z.string()),
});

const SkillNotePayload = z.object({ note: z.string().min(1) });
const UpdateNodePayload = z.object({
  nodeId: z.string().min(1),
  set: z.record(z.string(), z.string()),
});
const AddExceptionPayload = z.object({
  constraintId: z.string().min(1),
  exceptId: z.string().min(1),
});

export const ProposalSchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.string(),
    status: z.enum(PROPOSAL_STATUSES),
    kind: z.enum(PROPOSAL_KINDS),
    summary: z.string().min(1),
    evidence: EvidenceSchema,
    payload: z.union([SkillNotePayload, UpdateNodePayload, AddExceptionPayload]),
  })
  .superRefine((p, ctx) => {
    const payloadSchema =
      p.kind === "skill-note"
        ? SkillNotePayload
        : p.kind === "update-node"
          ? UpdateNodePayload
          : AddExceptionPayload;
    if (!payloadSchema.safeParse(p.payload).success) {
      ctx.addIssue({
        code: "custom",
        path: ["payload"],
        message: `payload does not match kind "${p.kind}"`,
      });
    }
  });

export type Proposal = z.infer<typeof ProposalSchema>;

export type ApplyRoute = "learned-overlay" | "suggestion-sidecar";

/**
 * Where an approved proposal lands:
 *  - skill-note   → appended to .archik/evolution/learned.md
 *                   (Learned Overlay — read by the skill + MCP)
 *  - update-node / add-exception
 *                 → staged as a suggestion sidecar so the change
 *                   shows as a diff on the canvas and goes through
 *                   `archik suggest accept` like any other change
 */
export function applyRoute(p: Proposal): ApplyRoute {
  return p.kind === "skill-note" ? "learned-overlay" : "suggestion-sidecar";
}

const TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  pending: ["approved", "rejected"],
  approved: ["applied"],
  rejected: [],
  applied: [],
};

export function canTransition(
  from: ProposalStatus,
  to: ProposalStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Turn one reflection insight into a pending proposal. */
export function proposalFromInsight(
  insight: Insight,
  now: string,
  idSuffix: string,
): Proposal {
  const date = now.slice(0, 10);
  return ProposalSchema.parse({
    id: `p-${date}-${idSuffix}`,
    createdAt: now,
    status: "pending",
    kind: insight.proposalKind,
    summary: insight.summary,
    evidence: insight.evidence,
    payload: { note: insight.note },
  });
}
