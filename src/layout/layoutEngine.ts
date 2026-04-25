import type { Document } from "../domain/types.ts";
import type { PositionedDocument } from "./types.ts";

export interface LayoutEngine {
  readonly name: string;
  layout(doc: Document): Promise<PositionedDocument>;
}
