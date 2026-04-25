import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode };

export function GenericNode({ node }: Props): React.ReactElement {
  return (
    <g className={`archik-node archik-node--${node.kind}`}>
      <rect
        width={node.width}
        height={node.height}
        rx={6}
        ry={6}
        fill="#f8fafc"
        stroke="#475569"
        strokeWidth={1}
        strokeDasharray={node.kind === "external" ? "4 3" : undefined}
      />
      <text
        x={node.width / 2}
        y={20}
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={10}
        letterSpacing="0.05em"
        fill="#64748b"
      >
        {node.kind.toUpperCase()}
      </text>
      <text
        x={node.width / 2}
        y={node.height / 2 + 8}
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={13}
        fontWeight={600}
        fill="#0f172a"
      >
        {node.name}
      </text>
    </g>
  );
}
