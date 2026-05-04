/**
 * Alpha document — Essence/SEMAT alpha state tracker (`*.archik.alphas.yaml`).
 * Conventionally one file per project at `.archik/alphas.archik.alphas.yaml`.
 *
 * This milestone (M4) tracks four alphas — the subset that's directly
 * evidenced by the artifacts archik already manages:
 *   • stakeholders     (covered by .archik.actors.yaml)
 *   • requirements     (covered by .archik.uc.yaml + slice tests)
 *   • softwareSystem   (covered by .archik.yaml + drift + trace)
 *   • work             (covered by use case slice statuses + validate)
 *
 * The other three Essence alphas (Opportunity / Team / Way of Working)
 * are intentionally out of scope — they sit outside an architecture
 * tool's remit. A future milestone may add them.
 *
 * Each alpha state is either:
 *   • machine-checkable — `archik alpha promote` verifies the
 *     condition before writing. See `alpha-checks.ts`.
 *   • subjective — promotion succeeds without a check (the user is
 *     attesting to the state). Demotion is always free.
 */
import { z } from "zod";

/**
 * State ladders — Essence 1.2 progression for each alpha. Order
 * matters: the 0-th state is the lowest, the last is the highest.
 * `promote` walks UP this ladder; `demote` walks DOWN.
 */
export const STAKEHOLDERS_STATES = [
  "recognised",
  "represented",
  "involved",
  "in-agreement",
  "satisfied-for-deployment",
  "satisfied-in-use",
] as const;
export type StakeholdersState = (typeof STAKEHOLDERS_STATES)[number];

export const REQUIREMENTS_STATES = [
  "conceived",
  "bounded",
  "coherent",
  "acceptable",
  "addressed",
  "fulfilled",
] as const;
export type RequirementsState = (typeof REQUIREMENTS_STATES)[number];

export const SOFTWARE_SYSTEM_STATES = [
  "architecture-selected",
  "demonstrable",
  "usable",
  "ready",
  "operational",
  "retired",
] as const;
export type SoftwareSystemState = (typeof SOFTWARE_SYSTEM_STATES)[number];

export const WORK_STATES = [
  "initiated",
  "prepared",
  "started",
  "under-control",
  "concluded",
  "closed",
] as const;
export type WorkState = (typeof WORK_STATES)[number];

export const ALPHA_NAMES = [
  "stakeholders",
  "requirements",
  "softwareSystem",
  "work",
] as const;
export type AlphaName = (typeof ALPHA_NAMES)[number];

export const STATE_LADDERS: Record<AlphaName, ReadonlyArray<string>> = {
  stakeholders: STAKEHOLDERS_STATES,
  requirements: REQUIREMENTS_STATES,
  softwareSystem: SOFTWARE_SYSTEM_STATES,
  work: WORK_STATES,
};

/** Index in the ladder; -1 if not found. Lets `promote`/`demote` do
 *  ordinal comparisons without leaking the enum shape. */
export function stateIndex(alpha: AlphaName, state: string): number {
  return STATE_LADDERS[alpha].indexOf(state);
}

const AlphaEntrySchema = <T extends z.ZodTypeAny>(stateSchema: T) =>
  z.strictObject({
    state: stateSchema,
    note: z.string().optional(),
    evidence: z.array(z.string().min(1)).optional(),
  });

export const StakeholdersEntrySchema = AlphaEntrySchema(
  z.enum(STAKEHOLDERS_STATES),
);
export const RequirementsEntrySchema = AlphaEntrySchema(
  z.enum(REQUIREMENTS_STATES),
);
export const SoftwareSystemEntrySchema = AlphaEntrySchema(
  z.enum(SOFTWARE_SYSTEM_STATES),
);
export const WorkEntrySchema = AlphaEntrySchema(z.enum(WORK_STATES));

export const AlphaDocumentSchema = z.strictObject({
  version: z.literal("1.0"),
  description: z.string().optional(),
  alphas: z.strictObject({
    stakeholders: StakeholdersEntrySchema.optional(),
    requirements: RequirementsEntrySchema.optional(),
    softwareSystem: SoftwareSystemEntrySchema.optional(),
    work: WorkEntrySchema.optional(),
  }),
});

export type StakeholdersEntry = z.infer<typeof StakeholdersEntrySchema>;
export type RequirementsEntry = z.infer<typeof RequirementsEntrySchema>;
export type SoftwareSystemEntry = z.infer<typeof SoftwareSystemEntrySchema>;
export type WorkEntry = z.infer<typeof WorkEntrySchema>;
export type AlphaDocument = z.infer<typeof AlphaDocumentSchema>;
