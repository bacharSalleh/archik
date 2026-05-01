import type { PositionedEdge, Point } from "../layout/types.ts";
import type { Relationship } from "../domain/types.ts";

export const ARROW_MARKER_FILLED = "archik-arrow-filled";
export const ARROW_MARKER_OPEN = "archik-arrow-open";
export const ARROW_MARKER_CIRCLE = "archik-arrow-circle";
export const ARROW_MARKER_SELECTED = "archik-arrow-selected";
export const ARROW_MARKER_UML_TRIANGLE = "archik-arrow-uml-triangle";
export const ARROW_MARKER_UML_DIAMOND_FILLED = "archik-arrow-uml-diamond-filled";
export const ARROW_MARKER_DOUBLE = "archik-arrow-double";

type EdgeStyle = {
  /** Default stroke colour. Any edge with `color` set overrides this. */
  stroke: string;
  strokeWidth: number;
  /** Dash pattern. Empty / undefined means solid. */
  strokeDasharray?: string;
  /** When true the polyline gets the marching-dots flow animation. */
  animated?: boolean;
  /** Faster variant of the marching-dots animation. */
  animatedFast?: boolean;
  /** Marker on the *target* end of the edge (always set). */
  markerId: string;
  /**
   * Optional marker on the *source* end. Used for bidirectional
   * relationships (websocket) and UML composition's filled diamond
   * which sits at the owner end.
   */
  markerStartId?: string;
};

const DEFAULT_STROKE = "var(--archik-edge-filled)";
const STRUCTURAL_STROKE = "var(--archik-edge-dim)";

const STYLES: Record<Relationship, EdgeStyle> = {
  // -------- Sync request / response over the wire ----------------------
  http_call: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    strokeDasharray: "2 6",
    animated: true,
    markerId: ARROW_MARKER_FILLED,
  },
  grpc: {
    // Typed RPC — heavier line + double-tick arrow head distinguishes
    // from generic http.
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.8,
    strokeDasharray: "3 4",
    animated: true,
    markerId: ARROW_MARKER_DOUBLE,
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

  // -------- Persistent / async wire protocols --------------------------
  websocket: {
    // Long-lived bidirectional. Arrows on both ends, fast animation
    // to evoke the always-on chatter.
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.6,
    strokeDasharray: "4 3",
    animatedFast: true,
    markerId: ARROW_MARKER_FILLED,
    markerStartId: ARROW_MARKER_FILLED,
  },
  webhook: {
    // Async callback the other party pushes back. Long dashes hint at
    // "delayed", animation kept slow to distinguish from http_call.
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    strokeDasharray: "10 5",
    animated: true,
    markerId: ARROW_MARKER_OPEN,
  },

  // -------- Data access ------------------------------------------------
  reads: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.2,
    strokeDasharray: "2 6",
    animated: true,
    markerId: ARROW_MARKER_OPEN,
  },
  writes: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.7,
    strokeDasharray: "2 6",
    animated: true,
    markerId: ARROW_MARKER_FILLED,
  },

  // -------- Messaging --------------------------------------------------
  publishes: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    strokeDasharray: "2 6",
    animated: true,
    markerId: ARROW_MARKER_CIRCLE,
  },
  subscribes: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.4,
    strokeDasharray: "2 6",
    animated: true,
    markerId: ARROW_MARKER_FILLED,
  },
  streams_to: {
    stroke: DEFAULT_STROKE,
    strokeWidth: 1.7,
    strokeDasharray: "6 4",
    animatedFast: true,
    markerId: ARROW_MARKER_FILLED,
  },

  // -------- UML structural relationships -------------------------------
  // implements / extends / composes follow UML class-diagram conventions
  // so the visual matches what a software engineer expects on a board.
  implements: {
    // Realisation of an abstract interface — UML: dashed line +
    // hollow triangle at the interface end.
    stroke: STRUCTURAL_STROKE,
    strokeWidth: 1.2,
    strokeDasharray: "8 4",
    markerId: ARROW_MARKER_UML_TRIANGLE,
  },
  extends: {
    // Inheritance — UML: solid line + hollow triangle at the parent end.
    stroke: STRUCTURAL_STROKE,
    strokeWidth: 1.4,
    markerId: ARROW_MARKER_UML_TRIANGLE,
  },
  composes: {
    // Composition — UML: solid line + filled diamond at the *owner*
    // end. ELK-rendered edges go from source → target, so we put the
    // diamond at markerStart (source = the whole that owns).
    stroke: STRUCTURAL_STROKE,
    strokeWidth: 1.4,
    markerId: ARROW_MARKER_FILLED,
    markerStartId: ARROW_MARKER_UML_DIAMOND_FILLED,
  },
  depends_on: {
    stroke: STRUCTURAL_STROKE,
    strokeWidth: 1.2,
    strokeDasharray: "6 4",
    markerId: ARROW_MARKER_OPEN,
  },
  has_a: {
    stroke: STRUCTURAL_STROKE,
    strokeWidth: 1.4,
    markerId: ARROW_MARKER_FILLED,
  },
  uses: {
    stroke: STRUCTURAL_STROKE,
    strokeWidth: 1.2,
    strokeDasharray: "4 4",
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
  // Prefer the ELK-placed label position — it accounts for adjacent
  // nodes and other labels. Fall back to the polyline midpoint for
  // edges without a label box reserved.
  const placed = edge.labels[0];
  const labelAt = placed
    ? { x: placed.x + placed.width / 2, y: placed.y + placed.height / 2 }
    : midpoint(all);
  const isSelected = selectedEdgeIds?.has(edge.id) ?? false;

  // Selected wins, then per-edge color override, then style default.
  const stroke = isSelected
    ? "var(--archik-selected)"
    : (edge.color ?? style.stroke);
  const strokeWidth = isSelected ? style.strokeWidth + 0.5 : style.strokeWidth;
  const markerId = isSelected ? ARROW_MARKER_SELECTED : style.markerId;
  const markerStartId =
    !isSelected && style.markerStartId !== undefined
      ? style.markerStartId
      : undefined;
  const polylineClass = isSelected
    ? undefined
    : style.animatedFast
      ? "archik-edge-flowing-fast"
      : style.animated
        ? "archik-edge-flowing"
        : undefined;

  // The marching-dots animation needs to advance exactly one dash
  // period per cycle, otherwise the dots visibly jump. We derive
  // the period from the same strokeDasharray we apply to the
  // polyline so streams (period 10), websockets (7), webhooks (15)
  // animate as smoothly as the http_call/writes/reads family (8).
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
