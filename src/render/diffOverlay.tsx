/**
 * Diff overlay primitives — shared between the in-canvas review
 * toggle (DiagramSvg with `diffStatuses`) and the standalone diff
 * SVG export (DiffSvg, used by `archik diff --out`). Lives in its
 * own module so DiagramSvg can pull it without creating a circular
 * import with DiffSvg (which also imports DiagramInner).
 */
import type {
  PositionedDocument,
  PositionedEdge,
  PositionedNode,
  Point,
} from "../layout/types.ts";
import type { DiffStatus, StatusMap } from "../domain/diff.ts";

const FRAME_INSET = -3;

export const DIFF_COLORS: Record<Exclude<DiffStatus, "unchanged">, string> = {
  added: "var(--archik-success)",
  removed: "var(--archik-danger)",
  changed: "var(--archik-warning)",
};

type AbsNode = PositionedNode & { absX: number; absY: number };

/**
 * Walk the positioned tree and emit every node with absolute (root-
 * coordinate) positions so frames can be placed without caring about
 * container offsets.
 */
export function flattenAbsoluteNodes(
  roots: PositionedDocument["roots"],
): AbsNode[] {
  const out: AbsNode[] = [];
  const walk = (
    nodes: PositionedDocument["roots"],
    offX: number,
    offY: number,
  ): void => {
    for (const n of nodes) {
      const absX = offX + n.x;
      const absY = offY + n.y;
      out.push({ ...n, absX, absY });
      if (n.children.length > 0) walk(n.children, absX, absY);
    }
  };
  walk(roots, 0, 0);
  return out;
}

function cssEscape(id: string): string {
  return id.replace(/[^a-z0-9-]/g, (ch) => `\\${ch}`);
}

/**
 * Inline <style> that fades any node marked `removed` to ~35%
 * opacity so the live shape pops. Apply alongside the diagram so
 * the selectors land on the rendered nodes.
 */
export function RemovedNodeDimmer({
  statuses,
  scopeClass,
}: {
  statuses: StatusMap;
  scopeClass: string;
}): React.ReactElement | null {
  const removed: string[] = [];
  for (const [id, status] of statuses.nodes) {
    if (status === "removed") removed.push(id);
  }
  if (removed.length === 0) return null;
  const css = removed
    .map(
      (id) =>
        `.${scopeClass} [data-archik-node-id="${cssEscape(id)}"] { opacity: 0.35; }`,
    )
    .join("\n");
  return <style>{css}</style>;
}

/**
 * Coloured frames around every changed node, plus +/−/~ badges.
 * Drawn in absolute coordinates (relative to the diagram root) so
 * placement matches the rendered nodes regardless of container
 * nesting.
 */
export function NodeDiffFrames({
  positioned,
  statuses,
}: {
  positioned: PositionedDocument;
  statuses: StatusMap;
}): React.ReactElement {
  return (
    <g className="archik-diff-nodes" pointerEvents="none">
      {flattenAbsoluteNodes(positioned.roots).map((node) => {
        const status = statuses.nodes.get(node.id);
        if (status === undefined || status === "unchanged") return null;
        return <NodeDiffFrame key={node.id} node={node} status={status} />;
      })}
    </g>
  );
}

function NodeDiffFrame({
  node,
  status,
}: {
  node: AbsNode;
  status: Exclude<DiffStatus, "unchanged">;
}): React.ReactElement {
  const color = DIFF_COLORS[status];
  const x = node.absX + FRAME_INSET;
  const y = node.absY + FRAME_INSET;
  const w = node.width - FRAME_INSET * 2;
  const h = node.height - FRAME_INSET * 2;
  const dash = status === "removed" ? "5 4" : undefined;
  // Outer halo a hair larger than the inner stroke for the glow.
  const halo = framePath(node.kind, x - 1, y - 1, w + 2, h + 2);
  const inner = framePath(node.kind, x, y, w, h);
  return (
    <g>
      <path
        d={halo}
        fill="none"
        stroke={color}
        strokeOpacity={0.25}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <path
        d={inner}
        fill="none"
        stroke={color}
        strokeWidth={2.2}
        strokeLinejoin="round"
        {...(dash !== undefined ? { strokeDasharray: dash } : {})}
        opacity={0.95}
      />
      <DiffBadge x={x + w - 6} y={y - 6} status={status} />
    </g>
  );
}

/**
 * Build the SVG path for a diff-overlay frame that matches the
 * underlying node's silhouette. A rounded rect for the standard
 * card shape, a pill for queues, a cylinder for databases, a cloud
 * for cloud nodes — so the green / amber / red highlight reads as
 * "this exact node" instead of "rectangle near that node".
 */
function framePath(
  kind: PositionedNode["kind"],
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  switch (kind) {
    case "queue": {
      // Pill / capsule — same rx the QueueNode uses.
      const r = Math.min(h / 2, 28);
      return roundedRect(x, y, w, h, r);
    }
    case "database":
      return cylinderPath(x, y, w, h, 12);
    case "cloud":
      return cloudPath(x, y, w, h);
    default:
      return roundedRect(x, y, w, h, 10);
  }
}

function roundedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const rx = Math.min(r, w / 2);
  const ry = Math.min(r, h / 2);
  return [
    `M ${x + rx} ${y}`,
    `H ${x + w - rx}`,
    `A ${rx} ${ry} 0 0 1 ${x + w} ${y + ry}`,
    `V ${y + h - ry}`,
    `A ${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}`,
    `H ${x + rx}`,
    `A ${rx} ${ry} 0 0 1 ${x} ${y + h - ry}`,
    `V ${y + ry}`,
    `A ${rx} ${ry} 0 0 1 ${x + rx} ${y}`,
    `Z`,
  ].join(" ");
}

/**
 * Mirrors DatabaseNode's cylinderPath: top ellipse cap, straight
 * sides, rounded bottom corners (r=10), flat floor — all offset to
 * (x, y).
 */
function cylinderPath(
  x: number,
  y: number,
  w: number,
  h: number,
  ry: number,
): string {
  const r = 10;
  return [
    `M ${x} ${y + ry}`,
    `L ${x} ${y + h - r}`,
    `A ${r} ${r} 0 0 0 ${x + r} ${y + h}`,
    `L ${x + w - r} ${y + h}`,
    `A ${r} ${r} 0 0 0 ${x + w} ${y + h - r}`,
    `L ${x + w} ${y + ry}`,
    `A ${w / 2} ${ry} 0 0 0 ${x} ${y + ry}`,
    `Z`,
  ].join(" ");
}

/** Mirrors CloudNode's cloudPath, offset to (x, y). */
function cloudPath(x: number, y: number, w: number, h: number): string {
  const margin = 2;
  const baseY = h - margin;
  const bumpBase = h * 0.62;
  const cornerR = Math.min(h * 0.18, 14);
  const span = w - 2 * margin;

  const maxR = h * 0.5;
  const r1 = Math.min(span * 0.15, maxR * 0.85);
  const r2 = Math.min(span * 0.18, maxR);
  const r3 = Math.min(span * 0.15, maxR * 0.85);

  const totalBumpW = 2 * (r1 + r2 + r3);
  const slack = Math.max(0, span - totalBumpW) / 4;

  const x0 = margin;
  const x3 = w - margin;
  const a = x0 + slack;
  const b = a + 2 * r1;
  const c = b + slack;
  const d = c + 2 * r2;
  const e = d + slack;
  const f = e + 2 * r3;

  return [
    `M ${x + x0} ${y + baseY - cornerR}`,
    `Q ${x + x0} ${y + baseY} ${x + x0 + cornerR} ${y + baseY}`,
    `L ${x + x3 - cornerR} ${y + baseY}`,
    `Q ${x + x3} ${y + baseY} ${x + x3} ${y + baseY - cornerR}`,
    `L ${x + x3} ${y + bumpBase}`,
    `L ${x + f} ${y + bumpBase}`,
    `A ${r3} ${r3} 0 0 0 ${x + e} ${y + bumpBase}`,
    `L ${x + d} ${y + bumpBase}`,
    `A ${r2} ${r2} 0 0 0 ${x + c} ${y + bumpBase}`,
    `L ${x + b} ${y + bumpBase}`,
    `A ${r1} ${r1} 0 0 0 ${x + a} ${y + bumpBase}`,
    `L ${x + x0} ${y + bumpBase}`,
    `Z`,
  ].join(" ");
}

function DiffBadge({
  x,
  y,
  status,
}: {
  x: number;
  y: number;
  status: Exclude<DiffStatus, "unchanged">;
}): React.ReactElement {
  const symbol = status === "added" ? "+" : status === "removed" ? "−" : "~";
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle
        r={9}
        fill={DIFF_COLORS[status]}
        stroke="var(--archik-canvas)"
        strokeWidth={1.5}
      />
      <text
        textAnchor="middle"
        y={4}
        fontSize={12}
        fontWeight={700}
        fill="white"
      >
        {symbol}
      </text>
    </g>
  );
}

/** Recoloured polylines on top of the original edges. */
export function EdgeDiffOverlays({
  positioned,
  statuses,
}: {
  positioned: PositionedDocument;
  statuses: StatusMap;
}): React.ReactElement {
  return (
    <g className="archik-diff-edges" pointerEvents="none">
      {positioned.edges.map((edge) => {
        const status = statuses.edges.get(edge.id);
        if (status === undefined || status === "unchanged") return null;
        return <EdgeDiffOverlay key={edge.id} edge={edge} status={status} />;
      })}
    </g>
  );
}

function EdgeDiffOverlay({
  edge,
  status,
}: {
  edge: PositionedEdge;
  status: Exclude<DiffStatus, "unchanged">;
}): React.ReactElement | null {
  const section = edge.sections[0];
  if (!section) return null;
  const all: Point[] = [
    section.startPoint,
    ...section.bendPoints,
    section.endPoint,
  ];
  return (
    <polyline
      points={all.map((p) => `${p.x},${p.y}`).join(" ")}
      fill="none"
      stroke={DIFF_COLORS[status]}
      strokeWidth={3}
      strokeOpacity={0.55}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={status === "removed" ? "8 4" : undefined}
    />
  );
}
