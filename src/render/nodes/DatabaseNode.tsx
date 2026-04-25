import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode; selected?: boolean };

export function DatabaseNode({ node, selected }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const ry = Math.min(10, h / 8);
  const hasStack = node.stack !== undefined;
  // Icons live at y ~= ry*2..ry*2+12; push the text down so it never
  // overlaps with the icon row inside the cylinder body.
  const textBaseY = ry * 2 + 22;
  const nameY = hasStack ? textBaseY : textBaseY + 6;
  const stackY = textBaseY + 18;
  const stroke = selected
    ? "var(--archik-selected)"
    : "var(--archik-node-stroke)";
  const strokeWidth = selected ? 1.8 : 1.4;
  const cls = selected ? "archik-selected-glow" : undefined;

  return (
    <g className="archik-node archik-node--database">
      <path
        className={cls}
        d={`M 0 ${ry} V ${h - ry} A ${w / 2} ${ry} 0 0 0 ${w} ${h - ry} V ${ry}`}
        fill="var(--archik-node-fill)"
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <ellipse
        className={cls}
        cx={w / 2}
        cy={ry}
        rx={w / 2}
        ry={ry}
        fill="var(--archik-node-fill)"
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
        strokeWidth={1.2}
        strokeDasharray="2 3"
        opacity={0.6}
      />
      <text
        x={w / 2}
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
          x={w / 2}
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
