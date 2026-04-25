import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode; selected?: boolean };

export function QueueNode({ node, selected }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const radius = Math.min(h / 2, 24);
  const dividerX = w - radius * 1.4;
  const hasStack = node.stack !== undefined;
  // Icons sit at y=8 inside the body; push the name/stack baseline down.
  const baseY = 28;
  const nameY = hasStack ? baseY : baseY + 6;
  const stackY = baseY + 18;
  const stroke = selected
    ? "var(--archik-selected)"
    : "var(--archik-node-stroke)";

  return (
    <g className="archik-node archik-node--queue">
      <rect
        className={selected ? "archik-selected-glow" : undefined}
        width={w}
        height={h}
        rx={radius}
        ry={radius}
        fill="var(--archik-node-fill)"
        stroke={stroke}
        strokeWidth={selected ? 1.8 : 1.4}
      />
      <line
        x1={dividerX}
        y1={6}
        x2={dividerX}
        y2={h - 6}
        stroke={stroke}
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
