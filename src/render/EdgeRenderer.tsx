import type { PositionedEdge, Point } from "../layout/types.ts";
import type { Relationship } from "../domain/types.ts";

export const ARROW_MARKER_ID = "archik-arrow";

const DASH_BY_RELATIONSHIP: Partial<Record<Relationship, string>> = {
  depends_on: "6 4",
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
  const dash = DASH_BY_RELATIONSHIP[edge.relationship];
  const labelAt = midpoint(all);

  return (
    <g
      data-archik-edge-id={edge.id}
      className={`archik-edge archik-edge--${edge.relationship}`}
    >
      <polyline
        points={pointsString(all)}
        fill="none"
        stroke="#0f172a"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd={`url(#${ARROW_MARKER_ID})`}
        {...(dash !== undefined ? { strokeDasharray: dash } : {})}
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
