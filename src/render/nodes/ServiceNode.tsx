import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode };

export function ServiceNode({ node }: Props): React.ReactElement {
  const stackY = 22 + 22;
  return (
    <g className="archik-node archik-node--service">
      <rect
        width={node.width}
        height={node.height}
        rx={10}
        ry={10}
        fill="#ffffff"
        stroke="#0f172a"
        strokeWidth={1.5}
      />
      <text
        x={node.width / 2}
        y={26}
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={14}
        fontWeight={600}
        fill="#0f172a"
      >
        {node.name}
      </text>
      {node.stack !== undefined && (
        <text
          x={node.width / 2}
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
