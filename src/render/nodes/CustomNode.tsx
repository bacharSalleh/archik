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
        rx={4}
        ry={4}
        fill={hasChildren ? "transparent" : "#f8fafc"}
        stroke="#0f172a"
        strokeOpacity={hasChildren ? 0.45 : 0.7}
        strokeWidth={1.2}
      />
      <text
        x={12}
        y={18}
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={11}
        fontWeight={600}
        fill="#475569"
      >
        {node.name}
      </text>
    </g>
  );
}
