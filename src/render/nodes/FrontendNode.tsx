import type { PositionedNode } from "../../layout/types.ts";
import { HEADER_HEIGHT, HeaderLabel } from "./NodeHeader.tsx";

type Props = { node: PositionedNode; selected?: boolean };

export function FrontendNode({ node, selected }: Props): React.ReactElement {
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
    <g className="archik-node archik-node--frontend">
      <rect
        className={selected ? "archik-selected-glow" : undefined}
        width={w}
        height={h}
        rx={8}
        ry={8}
        fill="var(--archik-node-fill)"
        stroke={stroke}
        strokeWidth={selected ? 1.8 : 1.4}
      />
      {/* Chrome dots — left side of the header bar. */}
      <g
        data-archik-frontend-chrome=""
        transform={`translate(8, ${HEADER_HEIGHT / 2})`}
      >
        <circle r={2.2} cx={0} cy={0} fill="var(--archik-node-chrome-dot)" />
        <circle r={2.2} cx={7} cy={0} fill="var(--archik-node-chrome-dot)" />
        <circle r={2.2} cx={14} cy={0} fill="var(--archik-node-chrome-dot)" />
      </g>
      <line
        x1={0}
        y1={HEADER_HEIGHT}
        x2={w}
        y2={HEADER_HEIGHT}
        stroke={stroke}
        strokeOpacity={0.25}
        strokeWidth={1}
      />
      <HeaderLabel cx={w / 2} cy={15} label="FRONTEND" />
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
