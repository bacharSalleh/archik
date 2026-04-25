import type { PositionedEdge, Point } from "../layout/types.ts";
import type { Relationship } from "../domain/types.ts";

export const ARROW_MARKER_FILLED = "archik-arrow-filled";
export const ARROW_MARKER_OPEN = "archik-arrow-open";
export const ARROW_MARKER_DEP = "archik-arrow-dep";
export const ARROW_MARKER_ASYNC = "archik-arrow-async";
export const ARROW_MARKER_CIRCLE = "archik-arrow-circle";

export const ARROW_COLORS = {
  filled: "#0f172a",
  open: "#334155",
  dep: "#64748b",
  async: "#1d4ed8",
  circle: "#1d4ed8",
} as const;

type EdgeStyle = {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  markerId: string;
};

const STYLES: Record<Relationship, EdgeStyle> = {
  http_call: {
    stroke: "var(--archik-edge-filled)",
    strokeWidth: 1.4,
    markerId: ARROW_MARKER_FILLED,
  },
  reads: {
    stroke: "var(--archik-edge-open)",
    strokeWidth: 1.2,
    markerId: ARROW_MARKER_OPEN,
  },
  writes: {
    stroke: "var(--archik-edge-filled)",
    strokeWidth: 1.6,
    markerId: ARROW_MARKER_FILLED,
  },
  publishes: {
    stroke: "var(--archik-edge-async)",
    strokeWidth: 1.4,
    markerId: ARROW_MARKER_CIRCLE,
  },
  subscribes: {
    stroke: "var(--archik-edge-async)",
    strokeWidth: 1.4,
    strokeDasharray: "6 4",
    markerId: ARROW_MARKER_ASYNC,
  },
  depends_on: {
    stroke: "var(--archik-edge-dim)",
    strokeWidth: 1.2,
    strokeDasharray: "6 4",
    markerId: ARROW_MARKER_DEP,
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
  selectedEdgeId?: string | undefined;
  onSelectEdge?: ((id: string) => void) | undefined;
};

export function EdgeRenderer({
  edge,
  selectedEdgeId,
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
  const labelAt = midpoint(all);
  const isSelected = selectedEdgeId === edge.id;

  const handleClick = onSelectEdge
    ? (e: React.MouseEvent<SVGGElement>) => {
        e.stopPropagation();
        onSelectEdge(edge.id);
      }
    : undefined;

  return (
    <g
      data-archik-edge-id={edge.id}
      data-archik-edge-relationship={edge.relationship}
      {...(isSelected ? { "data-archik-selected": "true" } : {})}
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
        points={pointsString(all)}
        fill="none"
        stroke={isSelected ? "var(--archik-selected)" : style.stroke}
        strokeWidth={isSelected ? style.strokeWidth + 1 : style.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd={`url(#${
          isSelected ? "archik-arrow-selected" : style.markerId
        })`}
        {...(style.strokeDasharray !== undefined
          ? { strokeDasharray: style.strokeDasharray }
          : {})}
      />
      {edge.label !== undefined && labelAt !== undefined && (
        <g transform={`translate(${labelAt.x}, ${labelAt.y - 6})`}>
          <text
            textAnchor="middle"
            fontSize={11}
            fill="var(--archik-fg-dim)"
            stroke="var(--archik-panel)"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {edge.label}
          </text>
        </g>
      )}
    </g>
  );
}
