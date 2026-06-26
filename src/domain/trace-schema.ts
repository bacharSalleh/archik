import { z } from "zod";
import { IdSchema } from "./schema.ts";

/** One recorded step in a concrete run. `id` (when set) matches a seq
 *  message id for binding; `from`/`to` are participant/actor ids; `data`
 *  holds the real values that flowed (arbitrary JSON). */
export const TraceStepSchema = z.strictObject({
  id: IdSchema.optional(),
  from: IdSchema,
  to: IdSchema,
  label: z.string().min(1),
  data: z
    .strictObject({
      in: z.unknown().optional(),
      out: z.unknown().optional(),
    })
    .optional(),
  status: z.enum(["ok", "error"]).default("ok"),
});

/** A machine-generated trace file: the concrete instance of a slice. */
export const TraceDocumentSchema = z.strictObject({
  version: z.literal("1.0"),
  useCase: IdSchema,
  slice: IdSchema,
  seqFile: z.string().min(1).optional(),
  recordedAt: z.string().min(1),
  steps: z.array(TraceStepSchema).min(1),
});

export type TraceStep = z.infer<typeof TraceStepSchema>;
export type TraceDocument = z.infer<typeof TraceDocumentSchema>;
