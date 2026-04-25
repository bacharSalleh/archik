import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode; selected?: boolean };

export function ServiceNode({ node, selected }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const hasStack = node.stack !== undefined;
  // Top 18px reserved for icons (kind tag, info). Center the text below.
  const bodyMid = 18 + (h - 18) / 2;
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
