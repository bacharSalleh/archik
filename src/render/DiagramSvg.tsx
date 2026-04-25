import type { PositionedDocument, ViewMode } from "../layout/types.ts";
import { NodeRenderer } from "./NodeRenderer.tsx";
import {
  ARROW_MARKER_CIRCLE,
  ARROW_MARKER_FILLED,
  ARROW_MARKER_OPEN,
  ARROW_MARKER_SELECTED,
  EdgeRenderer,
} from "./EdgeRenderer.tsx";

const VIEWBOX_PADDING = 24;

/**
 * Markers use SVG `context-stroke` so the arrow head inherits the line's
 * stroke color — that way per-edge color overrides and structural-vs-flow
 * styles automatically tint the arrow without needing a marker per color.
 *
 * `context-stroke` is supported in modern Chrome / Firefox / Safari.
 */
function FilledTriangleMarker({ id }: { id: string }): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="10"
      refY="5"
      markerWidth="6"
      markerHeight="6"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
    </marker>
  );
}

function OpenTriangleMarker({ id }: { id: string }): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 12 12"
      refX="11"
      refY="6"
      markerWidth="7"
      markerHeight="7"
      orient="auto-start-reverse"
    >
      <path
        d="M 1 1 L 11 6 L 1 11"
        fill="none"
        stroke="context-stroke"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </marker>
  );
}

function FilledCircleMarker({ id }: { id: string }): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerWidth="6"
      markerHeight="6"
      orient="auto"
    >
      <circle cx="5" cy="5" r="4" fill="context-stroke" />
    </marker>
  );
}

function SelectedArrowMarker({ id }: { id: string }): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="10"
      refY="5"
      markerWidth="6"
      markerHeight="6"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--archik-selected)" />
    </marker>
  );
}

type Props = {
  positioned: PositionedDocument;
  className?: string | undefined;
  zoom?: number;
  viewMode?: ViewMode;
  selectedNodeIds?: ReadonlySet<string>;
  selectedEdgeIds?: ReadonlySet<string>;
  onSelectNode?:
    | ((id: string, event: React.MouseEvent) => void)
    | undefined;
  onSelectEdge?:
    | ((id: string, event: React.MouseEvent) => void)
    | undefined;
  onSelectNothing?: (() => void) | undefined;
};

export function DiagramSvg({
  positioned,
  className,
  zoom = 1,
  viewMode = "detailed",
  selectedNodeIds,
  selectedEdgeIds,
  onSelectNode,
  onSelectEdge,
  onSelectNothing,
}: Props): React.ReactElement {
  const w = Math.max(positioned.width, 1);
  const h = Math.max(positioned.height, 1);
  const vx = -VIEWBOX_PADDING;
  const vy = -VIEWBOX_PADDING;
  const vw = w + VIEWBOX_PADDING * 2;
  const vh = h + VIEWBOX_PADDING * 2;

  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width={vw * zoom}
      height={vh * zoom}
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", flexShrink: 0 }}
      onClick={onSelectNothing}
    >
      <defs>
        <FilledTriangleMarker id={ARROW_MARKER_FILLED} />
        <OpenTriangleMarker id={ARROW_MARKER_OPEN} />
        <FilledCircleMarker id={ARROW_MARKER_CIRCLE} />
        <SelectedArrowMarker id={ARROW_MARKER_SELECTED} />
      </defs>
      <g className="archik-edges">
        {positioned.edges.map((edge) => (
          <EdgeRenderer
            key={edge.id}
            edge={edge}
            {...(selectedEdgeIds !== undefined ? { selectedEdgeIds } : {})}
            {...(onSelectEdge !== undefined ? { onSelectEdge } : {})}
          />
        ))}
      </g>
      <g className="archik-nodes">
        {positioned.roots.map((node) => (
          <NodeRenderer
            key={node.id}
            node={node}
            viewMode={viewMode}
            {...(selectedNodeIds !== undefined ? { selectedNodeIds } : {})}
            {...(onSelectNode !== undefined ? { onSelectNode } : {})}
          />
        ))}
      </g>
    </svg>
  );
}
