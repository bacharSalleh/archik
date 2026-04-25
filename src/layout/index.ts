import type { Document } from "../domain/types.ts";
import { elkLayoutEngine } from "./elkAdapter.ts";
import type { LayoutEngine } from "./layoutEngine.ts";
import type { PositionedDocument } from "./types.ts";

export const layoutEngines: Record<string, LayoutEngine> = {
  [elkLayoutEngine.name]: elkLayoutEngine,
};

export const defaultLayoutEngine: LayoutEngine = elkLayoutEngine;

export function layout(doc: Document): Promise<PositionedDocument> {
  return defaultLayoutEngine.layout(doc);
}

export type { LayoutEngine } from "./layoutEngine.ts";
export type {
  EdgeSection,
  PositionedDocument,
  PositionedEdge,
  PositionedNode,
  Point,
} from "./types.ts";
