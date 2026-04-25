import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode; selected?: boolean };

export function CacheNode({ node, selected }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  // Slightly lower stripe so the kind tag at top-left has clear room
  // to the left of the CACHE caption text.
  const stripeY = h * 0.34;
  const hasStack = node.stack !== undefined;
  const nameY = hasStack ? h * 0.66 - 2 : h * 0.6;
  const stackY = h * 0.66 + 14;
  const stroke = selected
    ? "var(--archik-selected)"
    : "var(--archik-node-stroke)";

  return (
    <g className="archik-node archik-node--cache">
      <rect
        className={selected ? "archik-selected-glow" : undefined}
        width={w}
        height={h}
        rx={8}
        ry={8}
        fill="var(--archik-node-fill-tinted)"
        stroke={stroke}
        strokeWidth={selected ? 1.8 : 1.4}
      />
      <line
        x1={10}
        y1={stripeY}
        x2={w - 10}
        y2={stripeY}
        stroke={stroke}
        strokeOpacity={0.3}
        strokeWidth={1}
      />
      <text
        x={w / 2 + 8}
        y={stripeY - 6}
        textAnchor="middle"
        fontSize={9}
        letterSpacing="0.08em"
        fill="var(--archik-node-caption)"
      >
        CACHE
      </text>
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
