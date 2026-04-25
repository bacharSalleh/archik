import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode; selected?: boolean };

export function CustomNode({ node, selected }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const hasChildren = node.children.length > 0;
  const stroke = selected
    ? "var(--archik-selected)"
    : "var(--archik-node-stroke-soft)";

  return (
    <g className="archik-node archik-node--custom">
      <rect
        className={selected ? "archik-selected-glow" : undefined}
        width={w}
        height={h}
        rx={6}
        ry={6}
        fill={hasChildren ? "transparent" : "var(--archik-node-fill-tinted)"}
        stroke={stroke}
        strokeOpacity={selected ? 1 : hasChildren ? 0.55 : 0.85}
        strokeWidth={selected ? 1.8 : 1.2}
        strokeDasharray={hasChildren && !selected ? "4 4" : undefined}
      />
      <text
        x={12}
        y={18}
        fontSize={11}
        letterSpacing="0.04em"
        fontWeight={600}
        fill="var(--archik-node-caption)"
      >
        {node.name}
      </text>
    </g>
  );
}
