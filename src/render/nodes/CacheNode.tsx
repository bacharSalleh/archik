import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode };

export function CacheNode({ node }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const stripeY = h * 0.32;
  const hasStack = node.stack !== undefined;
  const nameY = hasStack ? h * 0.62 - 2 : h / 2 + 4;
  const stackY = h * 0.62 + 14;

  return (
    <g className="archik-node archik-node--cache">
      <rect
        width={w}
        height={h}
        rx={8}
        ry={8}
        fill="#f1f5f9"
        stroke="#0f172a"
        strokeWidth={1.4}
      />
      <line
        x1={10}
        y1={stripeY}
        x2={w - 10}
        y2={stripeY}
        stroke="#0f172a"
        strokeOpacity={0.25}
        strokeWidth={1}
      />
      <text
        x={w / 2}
        y={stripeY - 6}
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={9}
        letterSpacing="0.08em"
        fill="#64748b"
      >
        CACHE
      </text>
      <text
        x={w / 2}
        y={nameY}
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={13}
        fontWeight={600}
        fill="#0f172a"
      >
        {node.name}
      </text>
      {hasStack && (
        <text
          x={w / 2}
          y={stackY}
          textAnchor="middle"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize={11}
          fill="#475569"
        >
          {node.stack}
        </text>
      )}
    </g>
  );
}
