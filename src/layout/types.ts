import type { Document, Edge, Node } from "../domain/types.ts";

export type Point = { x: number; y: number };

export type LayoutOptions = {
  /** Spacing between nodes within the same layer. Default 24. */
  nodeSpacing?: number;
  /** Spacing between successive layers. Default 40. */
  layerSpacing?: number;
  /** Container padding on every side. Default 16. */
  padding?: number;
};

export const DEFAULT_LAYOUT_OPTIONS: Required<LayoutOptions> = {
  nodeSpacing: 60,
  layerSpacing: 100,
  padding: 40,
};

export type PositionedNode = Node & {
  x: number;
  y: number;
  width: number;
  height: number;
  children: PositionedNode[];
};

export type EdgeSection = {
  startPoint: Point;
  endPoint: Point;
  bendPoints: Point[];
};

export type PositionedEdge = Edge & {
  sections: EdgeSection[];
};

export type PositionedDocument = {
  document: Document;
  width: number;
  height: number;
  roots: PositionedNode[];
  edges: PositionedEdge[];
};
