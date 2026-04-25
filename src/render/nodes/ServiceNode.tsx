import type { PositionedNode } from "../../layout/types.ts";
import { HEADER_HEIGHT, HeaderLabel } from "./NodeHeader.tsx";

type Props = { node: PositionedNode; selected?: boolean };

export function ServiceNode({ node, selected }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const hasStack = node.stack !== undefined;
  const bodyMid = HEADER_HEIGHT + (h - HEADER_HEIGHT) / 2;
  const nameY = hasStack ? bodyMid - 4 : bodyMid + 4;
  const stackY = bodyMid + 14;
  return (
    <g className="archik-node archik-node--service">
      <rect
        className={selected ? "archik-selected-glow" : undefined}
        width={w}
        height={h}
        rx={10}
        ry={10}
        fill="var(--archik-node-fill)"
        stroke={selected ? "var(--archik-selected)" : "var(--archik-node-stroke)"}
        strokeWidth={selected ? 1.8 : 1.4}
      />
      <line
        x1={0}
        y1={HEADER_HEIGHT}
        x2={w}
        y2={HEADER_HEIGHT}
        stroke="var(--archik-node-stroke)"
        strokeOpacity={0.25}
        strokeWidth={1}
      />
      <HeaderLabel cx={w / 2} cy={15} label="SERVICE" />
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
