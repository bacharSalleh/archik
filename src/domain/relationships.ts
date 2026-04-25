import { z } from "zod";

export const RELATIONSHIPS = [
  // synchronous calls
  "http_call",
  "invokes",
  "routes_to",
  // data access
  "reads",
  "writes",
  // messaging
  "publishes",
  "subscribes",
  "streams_to",
  // architectural / structural
  "implements",
  "depends_on",
  "has_a",
  "uses",
] as const;

export const RelationshipSchema = z.enum(RELATIONSHIPS);
export type Relationship = z.infer<typeof RelationshipSchema>;
