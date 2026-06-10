import type { z } from "zod";
import type {
  ConstraintSchema,
  DocumentMetadataSchema,
  DocumentSchema,
  EdgeSchema,
  InterfaceSchema,
  NodeSchema,
  NodeSelectorSchema,
} from "./schema.ts";

export type { NodeKind } from "./taxonomy.ts";
export type { Relationship } from "./relationships.ts";
export type {
  SeqArrow,
  SeqBranch,
  SeqDocument,
  SeqGroup,
  SeqGroupKind,
  SeqMessage,
  SeqNote,
  SeqNotePosition,
  SeqParticipant,
  SeqStep,
} from "./seq-types.ts";

export type Interface = z.infer<typeof InterfaceSchema>;
export type NodeSelector = z.infer<typeof NodeSelectorSchema>;
export type Constraint = z.infer<typeof ConstraintSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;
export type Document = z.infer<typeof DocumentSchema>;
