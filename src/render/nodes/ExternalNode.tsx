import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode };

export function ExternalNode({ node }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  return (
    <g className="archik-node archik-node--external">
      <rect
        width={w}
        height={h}
        rx={8}
        ry={8}
        fill="#f8fafc"
        stroke="#475569"
        strokeWidth={1.2}
        strokeDasharray="6 4"
      />
      <text
        x={w / 2}
        y={20}
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={9}
        letterSpacing="0.08em"
        fill="#64748b"
      >
        EXTERNAL
      </text>
      <text
        x={w / 2}
        y={h / 2 + 12}
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={13}
        fontWeight={600}
        fill="#0f172a"
      >
        {node.name}
      </text>
      {node.description !== undefined && (
        <text
          x={w / 2}
          y={h - 12}
          textAnchor="middle"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize={10}
          fill="#64748b"
        >
          {node.description}
        </text>
      )}
    </g>
  );
}
