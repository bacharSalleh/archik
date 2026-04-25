import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode };

export function QueueNode({ node }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const radius = Math.min(h / 2, 28);
  const dividerX = w - radius * 1.6;
  const hasStack = node.stack !== undefined;
  const nameY = hasStack ? h / 2 - 4 : h / 2 + 4;
  const stackY = h / 2 + 14;

  return (
    <g className="archik-node archik-node--queue">
      <rect
        width={w}
        height={h}
        rx={radius}
        ry={radius}
        fill="#ffffff"
        stroke="#0f172a"
        strokeWidth={1.4}
      />
      <line
        x1={dividerX}
        y1={6}
        x2={dividerX}
        y2={h - 6}
        stroke="#0f172a"
        strokeOpacity={0.35}
        strokeWidth={1}
      />
      <text
        x={(dividerX) / 2}
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
          x={dividerX / 2}
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
