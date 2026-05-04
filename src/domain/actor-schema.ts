import { z } from "zod";
import { IdSchema, NodeStatusSchema } from "./schema.ts";

/**
 * Actor — anything outside the system that interacts with it. In
 * Jacobson's OOSE / Use Case 2.0 terms, actors are the upstream
 * parent of use cases: every use case has at least a primary actor.
 *
 * `kind` distinguishes "actor" from "external system we depend on":
 *   - `human`           — a real user role (Customer, Admin, …)
 *   - `external-system` — a third-party system that initiates flows
 *                         against us (e.g. a webhook caller)
 *   - `time`            — a scheduled trigger (cron, timer)
 *   - `device`          — a sensor / IoT device
 *
 * Actors live in `*.archik.actors.yaml` files anywhere under `.archik/`.
 * Use case files reference actors by id; the validator ensures every
 * referenced id resolves.
 */
export const ActorKindSchema = z.enum([
  "human",
  "external-system",
  "time",
  "device",
]);

export const ActorSchema = z.strictObject({
  id: IdSchema,
  kind: ActorKindSchema,
  description: z.string().min(1),
  /** Optional list of goal ids this actor pursues. Free-form strings
   *  for now; a future milestone may bind these to use case ids. */
  goals: z.array(z.string().min(1)).optional(),
  status: NodeStatusSchema.optional(),
});

export const ActorDocumentSchema = z
  .strictObject({
    version: z.literal("1.0"),
    description: z.string().optional(),
    actors: z.array(ActorSchema).min(1),
  })
  .superRefine((doc, ctx) => {
    const ids = new Set<string>();
    doc.actors.forEach((a, i) => {
      if (ids.has(a.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["actors", i, "id"],
          message: `duplicate actor id "${a.id}"`,
        });
      }
      ids.add(a.id);
    });
  });

export type ActorKind = z.infer<typeof ActorKindSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type ActorDocument = z.infer<typeof ActorDocumentSchema>;
