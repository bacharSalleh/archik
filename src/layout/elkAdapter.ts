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

const CARD: { width: number; height: number } = { width: 172, height: 82 };
const CARD_SUBTITLE: { width: number; height: number } = {
  width: 172,
  height: 90,
};

const DETAILED_SIZE: Record<NodeKind, { width: number; height: number }> = {
  // Compute
  service: CARD,
  function: CARD,
  worker: CARD,
  agent: CARD,
  // Data
  database: CARD,
  cache: CARD_SUBTITLE,
  vectordb: CARD,
  storage: CARD,
  // Messaging
  queue: { width: 188, height: 80 },
  topic: CARD,
  stream: CARD,
  // Networking
  gateway: CARD,
  cdn: CARD,
  // Hexagonal
  interface: CARD,
  adapter: CARD,
  port: CARD,
  // AI
  llm: CARD,
  prompt: CARD,
  tool: CARD,
  // Identity
  auth: CARD,
  // Observability
  observability: CARD,
  // Cloud
  cloud: CARD,
  // UI
  frontend: CARD_SUBTITLE,
  // External
  external: { width: 184, height: 100 },
  // Structural
  module: { width: 240, height: 130 },
  custom: { width: 240, height: 130 },
};

const CHIP: { width: number; height: number } = { width: 152, height: 36 };
const CHIP_CONTAINER: { width: number; height: number } = {
  width: 200,
  height: 80,
};

const COMPACT_SIZE: Record<NodeKind, { width: number; height: number }> = {
  service: CHIP,
  function: CHIP,
  worker: CHIP,
  agent: CHIP,
  database: CHIP,
  cache: CHIP,
  vectordb: CHIP,
  storage: CHIP,
  queue: { width: 168, height: 36 },
  topic: CHIP,
  stream: CHIP,
  gateway: CHIP,
  cdn: CHIP,
  interface: CHIP,
  adapter: CHIP,
  port: CHIP,
  llm: CHIP,
  prompt: CHIP,
  tool: CHIP,
  auth: CHIP,
  observability: CHIP,
  cloud: CHIP,
  frontend: CHIP,
  external: { width: 168, height: 40 },
  module: CHIP_CONTAINER,
  custom: CHIP_CONTAINER,
};

function toElkNode(
  node: Node,
  children: ElkNode[],
  sizeTable: Record<NodeKind, { width: number; height: number }>,
): ElkNode {
  const size = sizeTable[node.kind];
  const elk: ElkNode = {
    id: node.id,
    width: size.width,
    height: size.height,
  };
  if (children.length > 0) elk.children = children;
  return elk;
}

function buildHierarchy(
  doc: Document,
  sizeTable: Record<NodeKind, { width: number; height: number }>,
): {
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
    return toElkNode(n, kids, sizeTable);
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
  const sizeTable =
    options.viewMode === "compact" ? COMPACT_SIZE : DETAILED_SIZE;
  const { roots, byId } = buildHierarchy(doc, sizeTable);
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
