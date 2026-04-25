import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode };

export function CustomNode({ node }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const hasChildren = node.children.length > 0;
  return (
    <g className="archik-node archik-node--custom">
      <rect
        width={w}
        height={h}
        rx={6}
        ry={6}
        fill={hasChildren ? "transparent" : "var(--archik-node-fill-tinted)"}
        stroke="var(--archik-node-stroke-soft)"
        strokeOpacity={hasChildren ? 0.55 : 0.85}
        strokeWidth={1.2}
        strokeDasharray={hasChildren ? "4 4" : undefined}
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
