import { z } from "zod";
import { IdSchema, NodeStatusSchema, SeqFilePathSchema } from "./schema.ts";

/**
 * Use case file (`*.archik.uc.yaml`) — one file per use case, lives
 * in `.archik/usecases/<id>.archik.uc.yaml`. Encodes Use Case 2.0 /
 * 3.0 shape: actor + goal + flows + slices, with each slice carrying
 * the test paths that prove it and an optional sequence-diagram
 * realization.
 *
 * Traceability:
 *   primaryActor → actor id (resolved by usecase-validate against
 *                            the actor index from *.archik.actors.yaml)
 *   slice.tests → on-disk test files (existence checked by
 *                                     usecase-validate, like sourcePath)
 *   slice.realization.seqFile → an existing `.archik.seq.yaml` whose
 *                               `realizes` block points back here
 *                               (bidirectional check in seq-validate)
 */

/**
 * Test path — same structural rules as SourcePath. Existence is
 * checked at validate time, mirroring the sourcePath pattern.
 */
export const TestPathSchema = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/"), {
    message: "test path must be relative (no leading /)",
  })
  .refine((p) => !p.includes("\\"), {
    message: "test path must use forward slashes",
  })
  .refine(
    (p) => !p.split("/").some((seg) => seg === ".."),
    { message: "test path must not contain `..` segments" },
  );

/**
 * `branchFrom` — a reference like `basic.3` meaning "this alternate
 * branches from step 3 of the basic flow". The flow id lookup +
 * step number bound check happen in superRefine because they need
 * the document context.
 */
const BRANCH_REF_PATTERN = /^[a-z][a-z0-9-]*\.\d+$/;
export const BranchFromSchema = z
  .string()
  .regex(
    BRANCH_REF_PATTERN,
    "branchFrom must be `<flowId>.<stepNumber>` (e.g. basic.3)",
  );

export const BasicFlowSchema = z.strictObject({
  steps: z.array(z.string().min(1)).min(1),
});

export const AlternateFlowSchema = z.strictObject({
  id: IdSchema,
  branchFrom: BranchFromSchema,
  steps: z.array(z.string().min(1)).min(1),
});

export const FlowsSchema = z.strictObject({
  basic: BasicFlowSchema,
  alternates: z.array(AlternateFlowSchema).optional(),
});

export const RealizationSchema = z.strictObject({
  seqFile: SeqFilePathSchema,
});

export const SliceSchema = z.strictObject({
  id: IdSchema,
  /** Description is REQUIRED — same rationale as nodes: a slice
   *  without a description is a black box neither user nor agent
   *  can reason about. */
  description: z.string().min(1),
  /** Flow ids the slice covers. At least the basic flow ("basic")
   *  must be listed. Alternates are referenced by their id. */
  flows: z.array(IdSchema).min(1),
  /** Test paths proving this slice. Active slices must have ≥ 1; the
   *  paths must exist on disk (checked in usecase-validate). */
  tests: z.array(TestPathSchema).optional(),
  realization: RealizationSchema.optional(),
  status: NodeStatusSchema.optional(),
});

export const UseCaseDocumentSchema = z
  .strictObject({
    version: z.literal("1.0"),
    /** Document id — also the use case id. References from seq files
     *  (`realizes.useCase`) target this id. */
    id: IdSchema,
    name: z.string().min(1),
    description: z.string().optional(),
    status: NodeStatusSchema.optional(),
    /** Primary actor id — resolved against the actor index built
     *  from all `*.archik.actors.yaml` files. */
    primaryActor: IdSchema,
    secondaryActors: z.array(IdSchema).optional(),
    goal: z.string().min(1),
    preconditions: z.array(z.string().min(1)).optional(),
    postconditions: z.array(z.string().min(1)).optional(),
    flows: FlowsSchema,
    slices: z.array(SliceSchema).min(1),
  })
  .superRefine((doc, ctx) => {
    // Build the flow-id → step-count index. Used for slice.flows and
    // alternate.branchFrom resolution.
    const flowSteps = new Map<string, number>();
    flowSteps.set("basic", doc.flows.basic.steps.length);
    const alternateIds = new Set<string>();
    if (doc.flows.alternates) {
      doc.flows.alternates.forEach((alt, i) => {
        if (alt.id === "basic") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["flows", "alternates", i, "id"],
            message: `alternate id "basic" collides with the basic flow`,
          });
        }
        if (alternateIds.has(alt.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["flows", "alternates", i, "id"],
            message: `duplicate alternate flow id "${alt.id}"`,
          });
        }
        alternateIds.add(alt.id);
        flowSteps.set(alt.id, alt.steps.length);
      });
      // Now that all flow ids are known, validate branchFrom targets.
      doc.flows.alternates.forEach((alt, i) => {
        const [refFlow, refStepStr] = alt.branchFrom.split(".");
        const refStep = Number(refStepStr);
        const target = flowSteps.get(refFlow!);
        if (target === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["flows", "alternates", i, "branchFrom"],
            message:
              `branchFrom "${alt.branchFrom}" references unknown flow "${refFlow}"`,
          });
          return;
        }
        if (refStep < 1 || refStep > target) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["flows", "alternates", i, "branchFrom"],
            message:
              `branchFrom "${alt.branchFrom}" step ${refStep} is out of range ` +
              `(flow "${refFlow}" has ${target} step(s))`,
          });
        }
      });
    }

    // Slice ids unique; flows referenced exist; active slices have tests.
    const sliceIds = new Set<string>();
    doc.slices.forEach((slice, i) => {
      if (sliceIds.has(slice.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slices", i, "id"],
          message: `duplicate slice id "${slice.id}"`,
        });
      }
      sliceIds.add(slice.id);
      slice.flows.forEach((flowId, j) => {
        if (!flowSteps.has(flowId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["slices", i, "flows", j],
            message:
              `slice "${slice.id}" references unknown flow "${flowId}". ` +
              `Available: ${Array.from(flowSteps.keys()).join(", ")}.`,
          });
        }
      });
      // The slice must include the basic flow OR derive from one of
      // the alternates that branches off basic. Heuristic: every slice
      // includes "basic" in its flows array. Anything else is almost
      // always an authoring mistake — alternates branch off basic, so
      // a slice that omits basic loses the prefix.
      if (!slice.flows.includes("basic")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slices", i, "flows"],
          message:
            `slice "${slice.id}" does not include the basic flow. Slices ` +
            `must include "basic" plus zero or more alternates that branch ` +
            `off it; otherwise the alternate has no prefix to branch from.`,
        });
      }
      const isPlanned = slice.status === "proposed" || slice.status === "deprecated";
      if (!isPlanned && (slice.tests === undefined || slice.tests.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slices", i, "tests"],
          message:
            `slice "${slice.id}" has no tests. Active slices must declare ` +
            `at least one test path (each must exist on disk). Mark the ` +
            `slice \`status: proposed\` if the test isn't written yet.`,
        });
      }
    });
  });

export type UseCaseDocument = z.infer<typeof UseCaseDocumentSchema>;
export type UseCaseSlice = z.infer<typeof SliceSchema>;
export type BasicFlow = z.infer<typeof BasicFlowSchema>;
export type AlternateFlow = z.infer<typeof AlternateFlowSchema>;
