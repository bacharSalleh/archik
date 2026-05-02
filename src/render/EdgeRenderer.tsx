import type { PositionedEdge, Point } from "../layout/types.ts";
import type { Relationship } from "../domain/types.ts";

export const ARROW_MARKER_FILLED = "archik-arrow-filled";
export const ARROW_MARKER_OPEN = "archik-arrow-open";
export const ARROW_MARKER_SELECTED = "archik-arrow-selected";

type EdgeStyle = {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  animated?: boolean;
  markerId: string;
  markerStartId?: string;
};

const DEFAULT_STROKE = "var(--archik-edge-filled)";
const STRUCTURAL_STROKE = "var(--archik-edge-dim)";

// Wire edges (HTTP, RPC, etc.) are dashed + animated to show data flowing
// over the wire. Everything else is solid — clean and uncluttered.
const STYLES: Record<Relationship, EdgeStyle> = {
  // Wire — dashed + animated
  http_call: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    strokeDasharray: "2 6",
    animated: true,
    markerId: ARROW_MARKER_FILLED,
  },
  grpc: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    strokeDasharray: "2 6",
    animated: true,
    markerId: ARROW_MARKER_FILLED,
  },
  invokes: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    strokeDasharray: "2 6",
    animated: true,
    markerId: ARROW_MARKER_FILLED,
  },
  routes_to: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    markerId: ARROW_MARKER_FILLED,
  },
  websocket: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    strokeDasharray: "2 6",
    animated: true,
    markerId: ARROW_MARKER_FILLED,
    markerStartId: ARROW_MARKER_FILLED,
  },
  webhook: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    strokeDasharray: "2 6",
    animated: true,
    markerId: ARROW_MARKER_FILLED,
  },

  // Data access — solid
  reads: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    markerId: ARROW_MARKER_OPEN,
  },
  writes: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    markerId: ARROW_MARKER_FILLED,
  },

  // Messaging — solid
  publishes: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    markerId: ARROW_MARKER_FILLED,
  },
  subscribes: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    markerId: ARROW_MARKER_FILLED,
  },
  streams_to: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    markerId: ARROW_MARKER_FILLED,
  },

  // Structural — solid, dimmer
  implements: {
    stroke: STRUCTURAL_STROKE,
    strokeWidth: 1.2,
    markerId: ARROW_MARKER_OPEN,
  },
  extends: {
    stroke: STRUCTURAL_STROKE,
    strokeWidth: 1.2,
    markerId: ARROW_MARKER_OPEN,
  },
  depends_on: {
    stroke: STRUCTURAL_STROKE,
    strokeWidth: 1.2,
    markerId: ARROW_MARKER_OPEN,
  },
  has_a: {
    stroke: STRUCTURAL_STROKE,
    strokeWidth: 1.2,
    markerId: ARROW_MARKER_FILLED,
  },
  uses: {
    stroke: STRUCTURAL_STROKE,
    strokeWidth: 1.2,
    markerId: ARROW_MARKER_OPEN,
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
  const markerId = isSelected ? ARROW_MARKER_SELECTED : style.markerId;
  const markerStartId =
    !isSelected && style.markerStartId !== undefined
      ? style.markerStartId
      : undefined;
  const polylineClass =
    !isSelected && style.animated ? "archik-edge-flowing" : undefined;

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
        markerEnd={`url(#${markerId})`}
        {...(markerStartId !== undefined
          ? { markerStart: `url(#${markerStartId})` }
          : {})}
        {...(style.strokeDasharray !== undefined
          ? { strokeDasharray: style.strokeDasharray }
          : {})}
        {...(polylineStyle !== undefined ? { style: polylineStyle } : {})}
      />
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
