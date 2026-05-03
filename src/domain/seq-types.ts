import type { z } from "zod";
import type {
  SeqArrowSchema,
  SeqGroupKindSchema,
  SeqNotePositionSchema,
} from "./seq-schema.ts";

export type {
  SeqBranch,
  SeqDocument,
  SeqGroup,
  SeqMessage,
  SeqNote,
  SeqParticipant,
  SeqStep,
} from "./seq-schema.ts";

export type SeqArrow = z.infer<typeof SeqArrowSchema>;
export type SeqGroupKind = z.infer<typeof SeqGroupKindSchema>;
export type SeqNotePosition = z.infer<typeof SeqNotePositionSchema>;
