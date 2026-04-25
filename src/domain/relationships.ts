import { z } from "zod";

export const RELATIONSHIPS = [
  "http_call",
  "reads",
  "writes",
  "publishes",
  "subscribes",
  "depends_on",
] as const;

export const RelationshipSchema = z.enum(RELATIONSHIPS);
export type Relationship = z.infer<typeof RelationshipSchema>;
