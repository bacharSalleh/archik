import type { Document } from "../domain/types.ts";
import type { LayoutOptions, PositionedDocument } from "./types.ts";

export interface LayoutEngine {
  readonly name: string;
  layout(
    doc: Document,
    options?: LayoutOptions,
  ): Promise<PositionedDocument>;
}
