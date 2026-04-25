import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode };

export function QueueNode({ node }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const radius = Math.min(h / 2, 24);
  const dividerX = w - radius * 1.4;
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
        fill="var(--archik-node-fill)"
        stroke="var(--archik-node-stroke)"
        strokeWidth={1.4}
      />
      <line
        x1={dividerX}
        y1={6}
        x2={dividerX}
        y2={h - 6}
        stroke="var(--archik-node-stroke)"
        strokeOpacity={0.4}
        strokeWidth={1}
      />
      <text
        x={dividerX / 2}
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
          x={dividerX / 2}
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
