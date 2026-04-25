import type { PositionedNode } from "../../layout/types.ts";
import { HEADER_HEIGHT, NodeHeader } from "./NodeHeader.tsx";

type Props = { node: PositionedNode; selected?: boolean };

export function FunctionNode({ node, selected }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const hasStack = node.stack !== undefined;
  const bodyMid = HEADER_HEIGHT + (h - HEADER_HEIGHT) / 2;
  const nameY = hasStack ? bodyMid - 4 : bodyMid + 4;
  const stackY = bodyMid + 14;
  const stroke = selected
    ? "var(--archik-selected)"
    : "var(--archik-node-stroke)";

  return (
    <g className="archik-node archik-node--function">
      <rect
        className={selected ? "archik-selected-glow" : undefined}
        width={w}
        height={h}
        rx={14}
        ry={14}
        fill="var(--archik-node-fill)"
        stroke={stroke}
        strokeWidth={selected ? 1.8 : 1.4}
      />
      <line
        x1={4}
        y1={HEADER_HEIGHT}
        x2={w - 4}
        y2={HEADER_HEIGHT}
        stroke={stroke}
        strokeOpacity={0.25}
        strokeWidth={1}
      />
      <NodeHeader
        kind="function"
        iconAt={{ cx: 18, cy: HEADER_HEIGHT / 2 }}
        labelAt={{ cx: w / 2, cy: HEADER_HEIGHT / 2 + 3 }}
      />
      <text
        x={w / 2}
        y={nameY}
        textAnchor="middle"
        fontSize={13}
        fontWeight={600}
        fill="var(--archik-node-text)"
      >
        {node.name}
      </text>
      {hasStack && (
        <text
          x={w / 2}
          y={stackY}
          textAnchor="middle"
          fontSize={11}
          fill="var(--archik-node-text-dim)"
        >
          {node.stack}
        </text>
      )}
    </g>
  );
}
