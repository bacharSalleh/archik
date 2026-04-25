import type { PositionedDocument } from "../layout/types.ts";
import { NodeRenderer } from "./NodeRenderer.tsx";
import {
  ARROW_COLORS,
  ARROW_MARKER_ASYNC,
  ARROW_MARKER_CIRCLE,
  ARROW_MARKER_DEP,
  ARROW_MARKER_FILLED,
  ARROW_MARKER_OPEN,
  EdgeRenderer,
} from "./EdgeRenderer.tsx";

const VIEWBOX_PADDING = 24;

function FilledTriangleMarker({
  id,
  fill,
}: {
  id: string;
  fill: string;
}): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerWidth="8"
      markerHeight="8"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 z" fill={fill} />
    </marker>
  );
}

function OpenTriangleMarker({
  id,
  stroke,
}: {
  id: string;
  stroke: string;
}): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 12 12"
      refX="11"
      refY="6"
      markerWidth="9"
      markerHeight="9"
      orient="auto-start-reverse"
    >
      <path
        d="M 1 1 L 11 6 L 1 11"
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </marker>
  );
}

function FilledCircleMarker({
  id,
  fill,
}: {
  id: string;
  fill: string;
}): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerWidth="7"
      markerHeight="7"
      orient="auto"
    >
      <circle cx="5" cy="5" r="4" fill={fill} />
    </marker>
  );
}

type Props = {
  positioned: PositionedDocument;
  className?: string | undefined;
  selectedNodeId?: string | undefined;
  selectedEdgeId?: string | undefined;
  onSelectNode?: ((id: string) => void) | undefined;
  onSelectEdge?: ((id: string) => void) | undefined;
  onSelectNothing?: (() => void) | undefined;
};

export function DiagramSvg({
  positioned,
  className,
  selectedNodeId,
  selectedEdgeId,
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
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={onSelectNothing}
    >
      <defs>
        <FilledTriangleMarker
          id={ARROW_MARKER_FILLED}
          fill={ARROW_COLORS.filled}
        />
        <OpenTriangleMarker
          id={ARROW_MARKER_OPEN}
          stroke={ARROW_COLORS.open}
        />
        <OpenTriangleMarker
          id={ARROW_MARKER_DEP}
          stroke={ARROW_COLORS.dep}
        />
        <FilledTriangleMarker
          id={ARROW_MARKER_ASYNC}
          fill={ARROW_COLORS.async}
        />
        <FilledCircleMarker
          id={ARROW_MARKER_CIRCLE}
          fill={ARROW_COLORS.circle}
        />
      </defs>
      <g className="archik-edges">
        {positioned.edges.map((edge) => (
          <EdgeRenderer
            key={edge.id}
            edge={edge}
            {...(selectedEdgeId !== undefined ? { selectedEdgeId } : {})}
            {...(onSelectEdge !== undefined ? { onSelectEdge } : {})}
          />
        ))}
      </g>
      <g className="archik-nodes">
        {positioned.roots.map((node) => (
          <NodeRenderer
            key={node.id}
            node={node}
            {...(selectedNodeId !== undefined ? { selectedNodeId } : {})}
            {...(onSelectNode !== undefined ? { onSelectNode } : {})}
          />
        ))}
      </g>
    </svg>
  );
}
