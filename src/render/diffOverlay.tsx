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
  return (
    <g>
      <rect
        x={x - 1}
        y={y - 1}
        width={w + 2}
        height={h + 2}
        rx={11}
        ry={11}
        fill="none"
        stroke={color}
        strokeOpacity={0.25}
        strokeWidth={6}
      />
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={10}
        ry={10}
        fill="none"
        stroke={color}
        strokeWidth={2.2}
        strokeDasharray={status === "removed" ? "5 4" : undefined}
        opacity={0.95}
      />
      <DiffBadge x={x + w - 6} y={y - 6} status={status} />
    </g>
  );
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
