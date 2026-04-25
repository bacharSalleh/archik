import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode };

export function CacheNode({ node }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const stripeY = h * 0.32;
  const hasStack = node.stack !== undefined;
  const nameY = hasStack ? h * 0.62 - 2 : h / 2 + 6;
  const stackY = h * 0.62 + 14;

  return (
    <g className="archik-node archik-node--cache">
      <rect
        width={w}
        height={h}
        rx={8}
        ry={8}
        fill="var(--archik-node-fill-tinted)"
        stroke="var(--archik-node-stroke)"
        strokeWidth={1.4}
      />
      <line
        x1={10}
        y1={stripeY}
        x2={w - 10}
        y2={stripeY}
        stroke="var(--archik-node-stroke)"
        strokeOpacity={0.3}
        strokeWidth={1}
      />
      <text
        x={w / 2}
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
