import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import type { Document, Node, NodeKind } from "../domain/types.ts";
import type { LayoutEngine } from "./layoutEngine.ts";
import {
  DEFAULT_LAYOUT_OPTIONS as DEFAULTS,
  type EdgeSection,
  type LayoutOptions,
  type PositionedDocument,
  type PositionedEdge,
  type PositionedNode,
  type Point,
} from "./types.ts";

function buildElkOptions(options: LayoutOptions): Record<string, string> {
  const nodeSpacing = options.nodeSpacing ?? DEFAULTS.nodeSpacing;
  const layerSpacing = options.layerSpacing ?? DEFAULTS.layerSpacing;
  const padding = options.padding ?? DEFAULTS.padding;
  return {
    "elk.algorithm": "layered",
    "elk.direction": "RIGHT",
    "elk.edgeRouting": "ORTHOGONAL",
    "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
    "elk.spacing.nodeNode": String(nodeSpacing),
    "elk.padding": `[top=${padding}, left=${padding}, bottom=${padding}, right=${padding}]`,
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  };
}

const DEFAULT_SIZE: Record<NodeKind, { width: number; height: number }> = {
  service: { width: 156, height: 78 },
  database: { width: 130, height: 100 },
  queue: { width: 168, height: 72 },
  cache: { width: 144, height: 86 },
  frontend: { width: 160, height: 86 },
  external: { width: 168, height: 96 },
  function: { width: 152, height: 78 },
  custom: { width: 220, height: 120 },
};

function toElkNode(node: Node, children: ElkNode[]): ElkNode {
  const size = DEFAULT_SIZE[node.kind];
  const elk: ElkNode = {
    id: node.id,
    width: size.width,
    height: size.height,
  };
  if (children.length > 0) elk.children = children;
  return elk;
}

function buildHierarchy(doc: Document): {
  roots: ElkNode[];
  byId: Map<string, Node>;
} {
  const byId = new Map<string, Node>();
  for (const n of doc.nodes) byId.set(n.id, n);

  const childrenOf = new Map<string | undefined, Node[]>();
  for (const n of doc.nodes) {
    const arr = childrenOf.get(n.parentId) ?? [];
    arr.push(n);
    childrenOf.set(n.parentId, arr);
  }

  function build(n: Node): ElkNode {
    const kids = (childrenOf.get(n.id) ?? []).map(build);
    return toElkNode(n, kids);
  }

  const rootNodes = childrenOf.get(undefined) ?? [];
  return { roots: rootNodes.map(build), byId };
}

function toElkEdges(doc: Document): ElkExtendedEdge[] {
  return doc.edges.map((e) => ({
    id: e.id,
    sources: [e.from],
    targets: [e.to],
  }));
}

function num(x: number | undefined): number {
  return x ?? 0;
}

function toPoint(p: { x?: number; y?: number }): Point {
  return { x: num(p.x), y: num(p.y) };
}

function elkToPositionedNode(
  elk: ElkNode,
  source: Map<string, Node>,
): PositionedNode {
  const src = source.get(elk.id);
  if (!src) {
    throw new Error(`ELK returned unknown node id "${elk.id}"`);
  }
  const children = (elk.children ?? []).map((c) =>
    elkToPositionedNode(c, source),
  );
  return {
    ...src,
    x: num(elk.x),
    y: num(elk.y),
    width: num(elk.width),
    height: num(elk.height),
    children,
  };
}

function elkToPositionedEdges(
  elkRoot: ElkNode,
  doc: Document,
): PositionedEdge[] {
  const sectionsById = new Map<string, EdgeSection[]>();
  const collect = (n: ElkNode) => {
    for (const e of n.edges ?? []) {
      const sections: EdgeSection[] = (e.sections ?? []).map((s) => ({
        startPoint: toPoint(s.startPoint),
        endPoint: toPoint(s.endPoint),
        bendPoints: (s.bendPoints ?? []).map(toPoint),
      }));
      sectionsById.set(e.id, sections);
    }
    for (const c of n.children ?? []) collect(c);
  };
  collect(elkRoot);

  return doc.edges.map((e) => ({
    ...e,
    sections: sectionsById.get(e.id) ?? [],
  }));
}

const elk = new ELK();

async function runLayout(
  doc: Document,
  options: LayoutOptions = {},
): Promise<PositionedDocument> {
  if (doc.nodes.length === 0) {
    return { document: doc, width: 0, height: 0, roots: [], edges: [] };
  }
  const { roots, byId } = buildHierarchy(doc);
  const graph: ElkNode = {
    id: "__root__",
    layoutOptions: buildElkOptions(options),
    children: roots,
    edges: toElkEdges(doc),
  };
  const result = await elk.layout(graph);
  const positionedRoots = (result.children ?? []).map((c) =>
    elkToPositionedNode(c, byId),
  );
  return {
    document: doc,
    width: num(result.width),
    height: num(result.height),
    roots: positionedRoots,
    edges: elkToPositionedEdges(result, doc),
  };
}

export const elkLayoutEngine: LayoutEngine = {
  name: "elk",
  layout: runLayout,
};
