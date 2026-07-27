import type { PositionedEdge, Point } from "../layout/types.ts";
import type { Relationship } from "../domain/types.ts";
import {
  diamondArrowPath,
  filledArrowPath,
  openArrowPath,
  triangleArrowPath,
} from "./arrowhead.ts";

/** Arrowhead drawn at the edge's end point. */
export type EdgeHead = "filled" | "open" | "triangle";
/** Arrowhead drawn at the edge's start point. */
export type EdgeStartHead = "filled" | "diamond";

export type EdgeStyle = {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  animated?: boolean;
  head: EdgeHead;
  startHead?: EdgeStartHead;
};

const DEFAULT_STROKE = "var(--archik-edge-filled)";
const STRUCTURAL_STROKE = "var(--archik-edge-dim)";

// Wire edges (HTTP, RPC, etc.) are dashed + animated to show data flowing
// over the wire. UML structural edges (implements, depends_on) use a
// non-animated dash. Everything else is solid — clean and uncluttered.
// Exported so the legend can draw each relationship with its true style.
export const STYLES: Record<Relationship, EdgeStyle> = {
  // Wire — dashed + animated
  http_call: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    strokeDasharray: "2 6",
    animated: true,
    head: "filled",
  },
  grpc: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    strokeDasharray: "2 6",
    animated: true,
    head: "filled",
  },
  invokes: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    strokeDasharray: "2 6",
    animated: true,
    head: "filled",
  },
  routes_to: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    head: "filled",
  },
  websocket: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    strokeDasharray: "2 6",
    animated: true,
    head: "filled",
    startHead: "filled",
  },
  webhook: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    strokeDasharray: "2 6",
    animated: true,
    head: "filled",
  },

  // Data access — solid
  reads: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    head: "open",
  },
  writes: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    head: "filled",
  },

  // Messaging — solid
  publishes: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    head: "filled",
  },
  subscribes: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    head: "filled",
  },
  streams_to: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    head: "filled",
  },

  // Structural — solid, dimmer. UML notation: hollow triangle for
  // generalization (extends) and realization (implements, dashed), open
  // arrow for dependencies (depends_on, dashed), filled diamond at the
  // owner end for composition (has_a).
  implements: {
    stroke: STRUCTURAL_STROKE,
    strokeWidth: 1.2,
    strokeDasharray: "7 5",
    head: "triangle",
  },
  extends: {
    stroke: STRUCTURAL_STROKE,
    strokeWidth: 1.2,
    head: "triangle",
  },
  depends_on: {
    stroke: STRUCTURAL_STROKE,
    strokeWidth: 1.2,
    strokeDasharray: "7 5",
    head: "open",
  },
  has_a: {
    stroke: STRUCTURAL_STROKE,
    strokeWidth: 1.2,
    head: "open",
    startHead: "diamond",
  },
  uses: {
    stroke: STRUCTURAL_STROKE,
    strokeWidth: 1.2,
    head: "open",
  },
};

function pointsString(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function midpoint(points: Point[]): Point | undefined {
  if (points.length === 0) return undefined;
  const i = Math.floor(points.length / 2);
  if (points.length % 2 === 1) return points[i];
  const a = points[i - 1]!;
  const b = points[i]!;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

type Props = {
  edge: PositionedEdge;
  selectedEdgeIds?: ReadonlySet<string>;
  onSelectEdge?:
    | ((id: string, event: React.MouseEvent) => void)
    | undefined;
};

export function EdgeRenderer({
  edge,
  selectedEdgeIds,
  onSelectEdge,
}: Props): React.ReactElement | null {
  const section = edge.sections[0];
  if (!section) return null;

  const all: Point[] = [
    section.startPoint,
    ...section.bendPoints,
    section.endPoint,
  ];
  const style = STYLES[edge.relationship];
  const placed = edge.labels[0];
  const labelAt = placed
    ? { x: placed.x + placed.width / 2, y: placed.y + placed.height / 2 }
    : midpoint(all);
  const isSelected = selectedEdgeIds?.has(edge.id) ?? false;

  const statusStroke =
    edge.status === "proposed"
      ? "var(--archik-status-proposed)"
      : edge.status === "deprecated"
        ? "var(--archik-status-deprecated)"
        : undefined;
  const stroke = isSelected
    ? "var(--archik-selected)"
    : (statusStroke ?? edge.color ?? style.stroke);
  const strokeWidth = isSelected ? style.strokeWidth + 0.5 : style.strokeWidth;
  const polylineClass =
    !isSelected && style.animated ? "archik-edge-flowing" : undefined;

  // Arrowheads as explicit paths (SVG <marker> needs context-stroke to
  // inherit the line color, which WebKit doesn't implement). The head
  // collapses to the selected style when the edge is selected.
  const tip = all[all.length - 1]!;
  const beforeTip = all[all.length - 2] ?? tip;
  const start = all[0]!;
  const afterStart = all[1] ?? start;
  const headKind: EdgeHead = isSelected ? "filled" : style.head;
  const startHeadKind: EdgeStartHead | undefined = isSelected
    ? undefined
    : style.startHead;

  const dashPeriod =
    style.strokeDasharray !== undefined
      ? style.strokeDasharray
          .trim()
          .split(/\s+/)
          .reduce((sum, n) => sum + Number(n), 0)
      : 0;
  const polylineStyle =
    polylineClass !== undefined && dashPeriod > 0
      ? ({ "--archik-dash-period": String(dashPeriod) } as React.CSSProperties)
      : undefined;

  const handleClick = onSelectEdge
    ? (e: React.MouseEvent<SVGGElement>) => {
        e.stopPropagation();
        onSelectEdge(edge.id, e);
      }
    : undefined;

  return (
    <g
      data-archik-edge-id={edge.id}
      data-archik-edge-relationship={edge.relationship}
      {...(isSelected ? { "data-archik-selected": "true" } : {})}
      {...(edge.status !== undefined && edge.status !== "active"
        ? { "data-archik-status": edge.status }
        : {})}
      className={`archik-edge archik-edge--${edge.relationship}`}
      {...(handleClick !== undefined ? { onClick: handleClick } : {})}
      style={onSelectEdge ? { cursor: "pointer" } : undefined}
    >
      {onSelectEdge && (
        <polyline
          data-archik-edge-hitarea=""
          points={pointsString(all)}
          fill="none"
          stroke="transparent"
          strokeWidth={14}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <polyline
        className={polylineClass}
        points={pointsString(all)}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...(style.strokeDasharray !== undefined
          ? { strokeDasharray: style.strokeDasharray }
          : {})}
        {...(polylineStyle !== undefined ? { style: polylineStyle } : {})}
      />
      {headKind === "filled" && (
        <path
          data-archik-arrowhead="end"
          d={filledArrowPath(tip, beforeTip)}
          fill={stroke}
        />
      )}
      {headKind === "open" && (
        <path
          data-archik-arrowhead="end"
          d={openArrowPath(tip, beforeTip)}
          fill="none"
          stroke={stroke}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {headKind === "triangle" && (
        <path
          data-archik-arrowhead="end"
          d={triangleArrowPath(tip, beforeTip)}
          fill="var(--archik-panel)"
          stroke={stroke}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      )}
      {startHeadKind === "filled" && (
        <path
          data-archik-arrowhead="start"
          d={filledArrowPath(start, afterStart)}
          fill={stroke}
        />
      )}
      {startHeadKind === "diamond" && (
        <path
          data-archik-arrowhead="start"
          d={diamondArrowPath(start, afterStart)}
          fill={stroke}
        />
      )}
      {edge.label !== undefined && labelAt !== undefined && (
        <g
          transform={`translate(${labelAt.x}, ${
            placed ? labelAt.y + 4 : labelAt.y - 6
          })`}
        >
          <text
            textAnchor="middle"
            fontSize={11}
            fontWeight={isSelected ? 700 : 500}
            fill={
              isSelected
                ? "var(--archik-selected)"
                : "var(--archik-fg-dim)"
            }
            stroke="var(--archik-panel)"
            strokeWidth={isSelected ? 4 : 3}
            paintOrder="stroke"
          >
            {edge.label}
          </text>
        </g>
      )}
    </g>
  );
}
