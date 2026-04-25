import type { Document } from "../domain/types.ts";
import { elkLayoutEngine } from "./elkAdapter.ts";
import type { LayoutEngine } from "./layoutEngine.ts";
import type { LayoutOptions, PositionedDocument } from "./types.ts";

export const layoutEngines: Record<string, LayoutEngine> = {
  [elkLayoutEngine.name]: elkLayoutEngine,
};

export const defaultLayoutEngine: LayoutEngine = elkLayoutEngine;

export function layout(
  doc: Document,
  options?: LayoutOptions,
): Promise<PositionedDocument> {
  return defaultLayoutEngine.layout(doc, options);
}

export type { LayoutEngine } from "./layoutEngine.ts";
export type {
  EdgeSection,
  LayoutOptions,
  PositionedDocument,
  PositionedEdge,
  PositionedNode,
  Point,
} from "./types.ts";
export { DEFAULT_LAYOUT_OPTIONS } from "./types.ts";
