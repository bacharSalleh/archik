import { z } from "zod";

export const NODE_KINDS = [
  "service",
  "database",
  "queue",
  "cache",
  "frontend",
  "external",
  "function",
  "custom",
] as const;

export const NodeKindSchema = z.enum(NODE_KINDS);
export type NodeKind = z.infer<typeof NodeKindSchema>;
