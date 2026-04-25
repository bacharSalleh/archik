import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode };

export function DatabaseNode({ node }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const ry = Math.min(12, h / 6);
  const fill = "#ffffff";
  const stroke = "#0f172a";
  const strokeWidth = 1.5;

  return (
    <g className="archik-node archik-node--database">
      <path
        d={`M 0 ${ry} V ${h - ry} A ${w / 2} ${ry} 0 0 0 ${w} ${h - ry} V ${ry}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <ellipse
        cx={w / 2}
        cy={ry}
        rx={w / 2}
        ry={ry}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <ellipse
        cx={w / 2}
        cy={h - ry}
        rx={w / 2}
        ry={ry}
        fill="transparent"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray="2 3"
        opacity={0.6}
      />
      <text
        x={w / 2}
        y={h / 2 + 4}
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={13}
        fontWeight={600}
        fill="#0f172a"
      >
        {node.name}
      </text>
      {node.stack !== undefined && (
        <text
          x={w / 2}
          y={h / 2 + 22}
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
