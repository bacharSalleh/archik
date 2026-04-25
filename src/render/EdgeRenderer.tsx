import type { PositionedEdge, Point } from "../layout/types.ts";
import type { Relationship } from "../domain/types.ts";

export const ARROW_MARKER_DEFAULT = "archik-arrow-default";
export const ARROW_MARKER_ASYNC = "archik-arrow-async";
export const ARROW_MARKER_DEP = "archik-arrow-dep";

export const ARROW_COLORS = {
  default: "#0f172a",
  async: "#1d4ed8",
  dep: "#64748b",
} as const;

type EdgeStyle = {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  markerId: string;
};

const STYLES: Record<Relationship, EdgeStyle> = {
  http_call: {
    stroke: "#0f172a",
    strokeWidth: 1.4,
    markerId: ARROW_MARKER_DEFAULT,
  },
  reads: {
    stroke: "#334155",
    strokeWidth: 1.2,
    markerId: ARROW_MARKER_DEFAULT,
  },
  writes: {
    stroke: "#0f172a",
    strokeWidth: 1.6,
    markerId: ARROW_MARKER_DEFAULT,
  },
  publishes: {
    stroke: "#1d4ed8",
    strokeWidth: 1.4,
    markerId: ARROW_MARKER_ASYNC,
  },
  subscribes: {
    stroke: "#1d4ed8",
    strokeWidth: 1.4,
    markerId: ARROW_MARKER_ASYNC,
  },
  depends_on: {
    stroke: "#64748b",
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

type Props = { edge: PositionedEdge };

export function EdgeRenderer({ edge }: Props): React.ReactElement | null {
  const section = edge.sections[0];
  if (!section) return null;

  const all: Point[] = [
    section.startPoint,
    ...section.bendPoints,
    section.endPoint,
  ];
  const style = STYLES[edge.relationship];
  const labelAt = midpoint(all);

  return (
    <g
      data-archik-edge-id={edge.id}
      data-archik-edge-relationship={edge.relationship}
      className={`archik-edge archik-edge--${edge.relationship}`}
    >
      <polyline
        points={pointsString(all)}
        fill="none"
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd={`url(#${style.markerId})`}
        {...(style.strokeDasharray !== undefined
          ? { strokeDasharray: style.strokeDasharray }
          : {})}
      />
      {edge.label !== undefined && labelAt !== undefined && (
        <g transform={`translate(${labelAt.x}, ${labelAt.y - 6})`}>
          <text
            textAnchor="middle"
            fontFamily="Inter, system-ui, sans-serif"
            fontSize={11}
            fill="#475569"
            stroke="#ffffff"
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
