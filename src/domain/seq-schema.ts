import { z } from "zod";
import { IdSchema, NodeStatusSchema, SeqFilePathSchema } from "./schema.ts";

export const SeqArrowSchema = z.enum(["sync", "async", "return", "create", "destroy"]);
export const SeqNotePositionSchema = z.enum(["over", "left_of", "right_of"]);
export const SeqGroupKindSchema = z.enum(["alt", "opt", "loop", "par", "break", "ref"]);

export const SeqParticipantSchema = z.strictObject({
  id: IdSchema,
  nodeId: IdSchema,
  label: z.string().min(1).optional(),
});

export const SeqMessageSchema = z.strictObject({
  type: z.literal("message"),
  id: IdSchema,
  from: IdSchema,
  to: IdSchema,
  label: z.string().min(1),
  arrow: SeqArrowSchema,
  activate: z.boolean().optional(),
  status: NodeStatusSchema.optional(),
});

export const SeqNoteSchema = z.strictObject({
  type: z.literal("note"),
  id: IdSchema,
  position: SeqNotePositionSchema,
  participants: z.array(IdSchema).min(1),
  text: z.string().min(1),
  status: NodeStatusSchema.optional(),
});

export type SeqMessage = z.infer<typeof SeqMessageSchema>;
export type SeqNote = z.infer<typeof SeqNoteSchema>;
export type SeqParticipant = z.infer<typeof SeqParticipantSchema>;

export type SeqBranch = {
  label?: string | undefined;
  steps: SeqStep[];
};

export type SeqGroup = {
  type: "group";
  id: string;
  kind: "alt" | "opt" | "loop" | "par" | "break" | "ref";
  condition?: string | undefined;
  label?: string | undefined;
  branches?: SeqBranch[] | undefined;
  seqFile?: string | undefined;
  participants?: string[] | undefined;
  status?: "proposed" | "active" | "deprecated" | undefined;
};

export type SeqStep = SeqMessage | SeqNote | SeqGroup;

const SeqBranchSchema: z.ZodType<SeqBranch> = z.lazy(() =>
  z.object({
    label: z.string().optional(),
    steps: z.array(SeqStepSchema),
  }),
);

export const SeqGroupSchema: z.ZodType<SeqGroup> = z.lazy(() =>
  z.object({
    type: z.literal("group"),
    id: IdSchema,
    kind: SeqGroupKindSchema,
    condition: z.string().optional(),
    label: z.string().optional(),
    branches: z.array(SeqBranchSchema).optional(),
    seqFile: SeqFilePathSchema.optional(),
    participants: z.array(IdSchema).optional(),
    status: NodeStatusSchema.optional(),
  }),
);

export const SeqStepSchema: z.ZodType<SeqStep> = z.lazy(() =>
  z.union([SeqMessageSchema, SeqNoteSchema, SeqGroupSchema]),
);

function collectStepIds(steps: SeqStep[], ids: Set<string>): string[] {
  const dupes: string[] = [];
  for (const step of steps) {
    if (ids.has(step.id)) dupes.push(step.id);
    else ids.add(step.id);
    if (step.type === "group" && step.branches) {
      for (const b of step.branches) dupes.push(...collectStepIds(b.steps, ids));
    }
  }
  return dupes;
}

export const SeqDocumentSchema = z
  .object({
    version: z.literal("1.0"),
    name: z.string().min(1),
    description: z.string().optional(),
    participants: z.array(SeqParticipantSchema),
    steps: z.array(SeqStepSchema),
  })
  .superRefine((doc, ctx) => {
    const participantIds = new Set<string>();
    for (let i = 0; i < doc.participants.length; i++) {
      const p = doc.participants[i]!;
      if (participantIds.has(p.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["participants", i, "id"],
          message: `duplicate participant id "${p.id}"`,
        });
      }
      participantIds.add(p.id);
    }
    const stepIds = new Set<string>();
    const dupes = collectStepIds(doc.steps, stepIds);
    for (const d of dupes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps"],
        message: `duplicate step id "${d}"`,
      });
    }
  });

export type SeqDocument = z.infer<typeof SeqDocumentSchema>;
