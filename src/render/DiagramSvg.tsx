import type { PositionedDocument } from "../layout/types.ts";
import { NodeRenderer } from "./NodeRenderer.tsx";
import {
  ARROW_COLORS,
  ARROW_MARKER_ASYNC,
  ARROW_MARKER_DEFAULT,
  ARROW_MARKER_DEP,
  EdgeRenderer,
} from "./EdgeRenderer.tsx";

const VIEWBOX_PADDING = 24;

function ArrowMarker({
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

type Props = {
  positioned: PositionedDocument;
  className?: string | undefined;
  selectedNodeId?: string | undefined;
  onSelectNode?: ((id: string) => void) | undefined;
  onSelectNothing?: (() => void) | undefined;
};

export function DiagramSvg({
  positioned,
  className,
  selectedNodeId,
  onSelectNode,
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
        <ArrowMarker id={ARROW_MARKER_DEFAULT} fill={ARROW_COLORS.default} />
        <ArrowMarker id={ARROW_MARKER_ASYNC} fill={ARROW_COLORS.async} />
        <ArrowMarker id={ARROW_MARKER_DEP} fill={ARROW_COLORS.dep} />
      </defs>
      <g className="archik-edges">
        {positioned.edges.map((edge) => (
          <EdgeRenderer key={edge.id} edge={edge} />
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
