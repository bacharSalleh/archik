import type { Document, Edge, Node } from "../domain/types.ts";

export type Point = { x: number; y: number };

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
