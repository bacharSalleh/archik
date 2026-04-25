import { z } from "zod";
import { NodeKindSchema } from "./taxonomy.ts";
import { RelationshipSchema } from "./relationships.ts";

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export const IdSchema = z
  .string()
  .regex(ID_PATTERN, "id must match /^[a-z][a-z0-9-]*$/");

export const InterfaceSchema = z.strictObject({
  name: z.string().min(1),
  protocol: z.string().min(1),
  description: z.string().optional(),
});

export const NodeSchema = z.strictObject({
  id: IdSchema,
  kind: NodeKindSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  stack: z.string().optional(),
  responsibilities: z.array(z.string().min(1)).optional(),
  interfaces: z.array(InterfaceSchema).optional(),
  notes: z.array(z.string()).optional(),
  parentId: IdSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const EdgeSchema = z.strictObject({
  id: IdSchema,
  from: IdSchema,
  to: IdSchema,
  relationship: RelationshipSchema,
  label: z.string().optional(),
  description: z.string().optional(),
  protocol: z.string().optional(),
  /** Optional per-edge stroke color override (any CSS color). */
  color: z.string().optional(),
});

export const DocumentMetadataSchema = z.strictObject({
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const DocumentSchema = z.strictObject({
  version: z.literal("1.0"),
  name: z.string().min(1),
  description: z.string().optional(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  metadata: DocumentMetadataSchema.optional(),
});

export const DOCUMENT_VERSION = "1.0" as const;
