import type {
  PositionedDocument,
  PositionedEdge,
  PositionedNode,
  Point,
} from "../layout/types.ts";
import type { StatusMap, DiffStatus } from "../domain/diff.ts";
import { DiagramInner } from "./DiagramSvg.tsx";

const VIEWBOX_PADDING = 24;
const FRAME_INSET = -3;
const LEGEND_PADDING = 12;

const COLORS: Record<Exclude<DiffStatus, "unchanged">, string> = {
  added: "var(--archik-success)",
  removed: "var(--archik-danger)",
  changed: "var(--archik-warning)",
};

const LABELS: Record<Exclude<DiffStatus, "unchanged">, string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
};

type Props = {
  positioned: PositionedDocument;
  statuses: StatusMap;
};

/**
 * Renders the same diagram DiagramSvg would, then layers diff
 * annotations on top: a coloured frame around every changed node, a
 * coloured tint over every changed edge, and a small legend in the
 * top-right corner. Removed entities are drawn at low opacity so the
 * visual reads as "this was here, it's gone now."
 */
export function DiffSvg({ positioned, statuses }: Props): React.ReactElement {
  const w = Math.max(positioned.width, 1);
  const h = Math.max(positioned.height, 1);
  const vx = -VIEWBOX_PADDING;
  const vy = -VIEWBOX_PADDING;
  const vw = w + VIEWBOX_PADDING * 2;
  const vh = h + VIEWBOX_PADDING * 2;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={vw}
      height={vh}
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* Base diagram, dim removed entities so the new shape pops. */}
      <BaseDiagram positioned={positioned} statuses={statuses} />

      {/* Edge overlays — recolored polylines on top of the originals. */}
      <g className="archik-diff-edges">
        {positioned.edges.map((edge) => {
          const status = statuses.edges.get(edge.id);
          if (status === undefined || status === "unchanged") return null;
          return (
            <EdgeDiffOverlay key={edge.id} edge={edge} status={status} />
          );
        })}
      </g>

      {/* Node overlays — coloured frames around changed nodes. */}
      <g className="archik-diff-nodes">
        {flattenNodes(positioned.roots).map((node) => {
          const status = statuses.nodes.get(node.id);
          if (status === undefined || status === "unchanged") return null;
          return <NodeDiffFrame key={node.id} node={node} status={status} />;
        })}
      </g>

      <Legend x={vx + vw - LEGEND_PADDING} y={vy + LEGEND_PADDING} />
    </svg>
  );
}

function BaseDiagram({
  positioned,
  statuses,
}: {
  positioned: PositionedDocument;
  statuses: StatusMap;
}): React.ReactElement {
  // Nothing fancy — DiagramSvg handles a lot of details (markers,
  // children recursion, header bars, edge styling per relationship).
  // We just dim what's removed so the live shape stands out.
  const removedNodeIds = new Set<string>();
  for (const [id, status] of statuses.nodes) {
    if (status === "removed") removedNodeIds.add(id);
  }
  return (
    <g className="archik-diff-base">
      <style>{`
        .archik-diff-base [data-archik-node-id="${"" /* placeholder */}"] { opacity: 1; }
        ${[...removedNodeIds]
          .map(
            (id) =>
              `.archik-diff-base [data-archik-node-id="${cssEscape(id)}"] { opacity: 0.35; }`,
          )
          .join("\n")}
      `}</style>
      <DiagramInner positioned={positioned} />
    </g>
  );
}

type AbsNode = PositionedNode & { absX: number; absY: number };

function NodeDiffFrame({
  node,
  status,
}: {
  node: AbsNode;
  status: Exclude<DiffStatus, "unchanged">;
}): React.ReactElement {
  const color = COLORS[status];
  const x = node.absX + FRAME_INSET;
  const y = node.absY + FRAME_INSET;
  const w = node.width - FRAME_INSET * 2;
  const h = node.height - FRAME_INSET * 2;
  return (
    <g pointerEvents="none">
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
  const color = COLORS[status];
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r={9} fill={color} stroke="var(--archik-canvas)" strokeWidth={1.5} />
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
  const color = COLORS[status];
  return (
    <polyline
      points={all.map((p) => `${p.x},${p.y}`).join(" ")}
      fill="none"
      stroke={color}
      strokeWidth={3}
      strokeOpacity={0.55}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={status === "removed" ? "8 4" : undefined}
      pointerEvents="none"
    />
  );
}

function Legend({ x, y }: { x: number; y: number }): React.ReactElement {
  const W = 130;
  const ROW = 18;
  const items: Array<Exclude<DiffStatus, "unchanged">> = [
    "added",
    "removed",
    "changed",
  ];
  const H = 12 + items.length * ROW;
  return (
    <g
      transform={`translate(${x - W}, ${y})`}
      pointerEvents="none"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      <rect
        width={W}
        height={H}
        rx={6}
        ry={6}
        fill="var(--archik-panel)"
        stroke="var(--archik-border)"
        strokeWidth={1}
        opacity={0.92}
      />
      <text x={10} y={14} fontSize={9.5} fontWeight={700} letterSpacing="0.12em" fill="var(--archik-fg-dim)">
        DIFF
      </text>
      {items.map((status, i) => (
        <g key={status} transform={`translate(10, ${22 + i * ROW})`}>
          <circle cx={6} cy={4} r={5} fill={COLORS[status]} />
          <text x={18} y={8} fontSize={11} fontWeight={500} fill="var(--archik-fg)">
            {LABELS[status]}
          </text>
        </g>
      ))}
    </g>
  );
}

/**
 * Walk the positioned tree and emit every node with absolute (root-
 * coordinate) positions so the overlay frames can be placed without
 * caring about container offsets.
 */
function flattenNodes(roots: PositionedDocument["roots"]): AbsNode[] {
  const out: AbsNode[] = [];
  const walk = (
    nodes: PositionedDocument["roots"],
    offX: number,
    offY: number,
  ) => {
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
  // Node ids are constrained to [a-z0-9-] by the schema, so this is
  // mostly defensive. Escape anything that's not safe inside a CSS
  // attribute selector.
  return id.replace(/[^a-z0-9-]/g, (ch) => `\\${ch}`);
}
