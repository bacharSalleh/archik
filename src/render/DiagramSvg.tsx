import type { PositionedDocument } from "../layout/types.ts";
import { NodeRenderer } from "./NodeRenderer.tsx";
import { ARROW_MARKER_ID, EdgeRenderer } from "./EdgeRenderer.tsx";

const VIEWBOX_PADDING = 24;

type Props = {
  positioned: PositionedDocument;
  className?: string | undefined;
};

export function DiagramSvg({
  positioned,
  className,
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
    >
      <defs>
        <marker
          id={ARROW_MARKER_ID}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0f172a" />
        </marker>
      </defs>
      <g className="archik-edges">
        {positioned.edges.map((edge) => (
          <EdgeRenderer key={edge.id} edge={edge} />
        ))}
      </g>
      <g className="archik-nodes">
        {positioned.roots.map((node) => (
          <NodeRenderer key={node.id} node={node} />
        ))}
      </g>
    </svg>
  );
}
