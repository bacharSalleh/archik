import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import type { Document, Node, NodeKind } from "../domain/types.ts";
import type { LayoutEngine } from "./layoutEngine.ts";
import {
  estimateTextWidth,
  LABEL_CHAR_PX,
  LABEL_HEIGHT,
  NAME_CHAR_PX,
  STACK_CHAR_PX,
} from "./text.ts";
import {
  DEFAULT_LAYOUT_OPTIONS as DEFAULTS,
  type EdgeSection,
  type LayoutOptions,
  type PositionedDocument,
  type PositionedEdge,
  type PositionedEdgeLabel,
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
    // Reserve space for edge labels so they don't overlap nodes / each
    // other. CENTER places the label at the long segment's midpoint;
    // edgeLabel/labelLabel keep gaps around it.
    "elk.edgeLabels.placement": "CENTER",
    "elk.spacing.edgeLabel": "8",
    "elk.spacing.labelLabel": "6",
    "elk.spacing.edgeNode": "20",
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
  database: { width: 180, height: 110 }, // cylinder needs vertical room for the top/bottom ellipses
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
  route: CARD,
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
  cloud: { width: 200, height: 120 }, // cumulus bumps need vertical headroom
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
  route: CHIP,
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

// Padding inside the card that we reserve so text never touches the
// border. 12px each side. Module / custom containers grow to fit their
// children, so we don't expand them here.
const NODE_HORIZ_PADDING = 24;
const NODE_MAX_WIDTH = 320;

function effectiveWidth(
  node: Node,
  defaultWidth: number,
  viewMode: "detailed" | "compact",
): number {
  if (node.kind === "module" || node.kind === "custom") return defaultWidth;

  if (viewMode === "compact") {
    // Compact chip shows the kind icon + name only. Icon + gutter ≈ 36px.
    const nameW = estimateTextWidth(node.name, STACK_CHAR_PX);
    const needed = 36 + nameW + 12;
    return Math.max(defaultWidth, Math.min(NODE_MAX_WIDTH, Math.ceil(needed)));
  }

  const nameW = estimateTextWidth(node.name, NAME_CHAR_PX);
  const stackW =
    node.stack !== undefined ? estimateTextWidth(node.stack, STACK_CHAR_PX) : 0;
  const needed = Math.max(nameW, stackW) + NODE_HORIZ_PADDING;
  return Math.max(defaultWidth, Math.min(NODE_MAX_WIDTH, Math.ceil(needed)));
}

// Inner padding used for container bodies. The top is generous so it
// reserves real estate for the CustomNode header bar (icon + name +
// KIND tag); other sides give children room from the border so edges
// crossing the boundary don't look like they pierce a child node.
const CONTAINER_PADDING = { top: 48, left: 18, bottom: 18, right: 18 };

function toElkNode(
  node: Node,
  children: ElkNode[],
  sizeTable: Record<NodeKind, { width: number; height: number }>,
  viewMode: "detailed" | "compact",
): ElkNode {
  const size = sizeTable[node.kind];
  const elk: ElkNode = {
    id: node.id,
    width: effectiveWidth(node, size.width, viewMode),
    height: size.height,
  };
  if (children.length > 0) {
    elk.children = children;
    // Any node with children is a container. Reserve top space for the
    // CustomNode / ContainerChip header. Compact mode's header is
    // shorter (24px) than detailed's (32px), so the padding differs.
    const pad =
      viewMode === "compact"
        ? { top: 30, left: 12, bottom: 12, right: 12 }
        : CONTAINER_PADDING;
    elk.layoutOptions = {
      "elk.padding": `[top=${pad.top}, left=${pad.left}, bottom=${pad.bottom}, right=${pad.right}]`,
    };
  }
  return elk;
}

function buildHierarchy(
  doc: Document,
  sizeTable: Record<NodeKind, { width: number; height: number }>,
  viewMode: "detailed" | "compact",
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
    return toElkNode(n, kids, sizeTable, viewMode);
  }

  const rootNodes = childrenOf.get(undefined) ?? [];
  return { roots: rootNodes.map(build), byId };
}

/** Cross-file edges (`fromFile` / `toFile` set) reference a node
 *  that lives in another archik file. ELK can't lay them out — the
 *  endpoint isn't in the graph — so we omit them entirely. The
 *  renderer surfaces them as a small badge on the local node. */
function isLocalEdge(e: Document["edges"][number]): boolean {
  return e.fromFile === undefined && e.toFile === undefined;
}

function toElkEdges(doc: Document): ElkExtendedEdge[] {
  return doc.edges.filter(isLocalEdge).map((e) => {
    const elk: ElkExtendedEdge = {
      id: e.id,
      sources: [e.from],
      targets: [e.to],
    };
    if (e.label !== undefined && e.label.length > 0) {
      // Tell ELK how much real estate the label needs so the layered
      // algorithm reserves space along the route. Without this the
      // labels overlap nodes whenever a segment is too short.
      elk.labels = [
        {
          text: e.label,
          width: Math.ceil(estimateTextWidth(e.label, LABEL_CHAR_PX)),
          height: LABEL_HEIGHT,
        },
      ];
    }
    return elk;
  });
}

function num(x: number | undefined): number {
  return x ?? 0;
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
  // Build absolute positions and ancestor chains for every node so we
  // can compute the lowest common ancestor (LCA) per edge. ELK stores
  // each edge's section coordinates RELATIVE TO ITS LCA, not relative
  // to whichever container the edge happens to be listed under in the
  // result tree — and the LCA can be deeper than __root__ even when
  // the edge was declared at the root. Without this offset, edges
  // between nodes inside containers render in the wrong place
  // entirely (right on top of unrelated nodes).
  const absolute = new Map<string, { x: number; y: number }>();
  const ancestors = new Map<string, string[]>();
  const walk = (n: ElkNode, ax: number, ay: number, chain: string[]) => {
    const x = ax + num(n.x);
    const y = ay + num(n.y);
    absolute.set(n.id, { x, y });
    ancestors.set(n.id, chain);
    const nextChain = [...chain, n.id];
    for (const c of n.children ?? []) walk(c, x, y, nextChain);
  };
  walk(elkRoot, 0, 0, []);

  const lcaOffset = (sourceId: string, targetId: string): { x: number; y: number } => {
    const a = ancestors.get(sourceId) ?? [];
    const b = ancestors.get(targetId) ?? [];
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    const lcaId = i === 0 ? elkRoot.id : a[i - 1]!;
    return absolute.get(lcaId) ?? { x: 0, y: 0 };
  };

  const sectionsById = new Map<string, EdgeSection[]>();
  const labelsById = new Map<string, PositionedEdgeLabel[]>();
  const collect = (n: ElkNode) => {
    for (const e of n.edges ?? []) {
      const sourceId = e.sources?.[0] ?? "";
      const targetId = e.targets?.[0] ?? "";
      const off = lcaOffset(sourceId, targetId);
      const shift = (p: { x?: number; y?: number }): Point => ({
        x: num(p.x) + off.x,
        y: num(p.y) + off.y,
      });
      const sections: EdgeSection[] = (e.sections ?? []).map((s) => ({
        startPoint: shift(s.startPoint),
        endPoint: shift(s.endPoint),
        bendPoints: (s.bendPoints ?? []).map(shift),
      }));
      sectionsById.set(e.id, sections);
      const labels: PositionedEdgeLabel[] = (e.labels ?? []).map((l) => ({
        text: typeof l.text === "string" ? l.text : "",
        x: num(l.x) + off.x,
        y: num(l.y) + off.y,
        width: num(l.width),
        height: num(l.height),
      }));
      labelsById.set(e.id, labels);
    }
    for (const c of n.children ?? []) collect(c);
  };
  collect(elkRoot);

  // Cross-file edges weren't sent to ELK and have no laid-out
  // sections — surface them in the result with empty geometry. The
  // EdgeRenderer skips drawing them; the per-node badge in
  // NodeRenderer handles their UI.
  return doc.edges.map((e) => ({
    ...e,
    sections: sectionsById.get(e.id) ?? [],
    labels: labelsById.get(e.id) ?? [],
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
  const viewMode = options.viewMode === "compact" ? "compact" : "detailed";
  const sizeTable = viewMode === "compact" ? COMPACT_SIZE : DETAILED_SIZE;
  const { roots, byId } = buildHierarchy(doc, sizeTable, viewMode);
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
