import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode; selected?: boolean };

export function FrontendNode({ node, selected }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const chromeH = 14;
  const bodyTop = chromeH;
  const bodyH = h - chromeH;
  const hasStack = node.stack !== undefined;
  const nameY = bodyTop + (hasStack ? bodyH / 2 - 4 : bodyH / 2 + 4);
  const stackY = bodyTop + bodyH / 2 + 14;
  const stroke = selected
    ? "var(--archik-selected)"
    : "var(--archik-node-stroke)";

  return (
    <g className="archik-node archik-node--frontend">
      <rect
        className={selected ? "archik-selected-glow" : undefined}
        width={w}
        height={h}
        rx={8}
        ry={8}
        fill="var(--archik-node-fill)"
        stroke={stroke}
        strokeWidth={selected ? 1.8 : 1.4}
      />
      <line
        data-archik-frontend-chrome=""
        x1={0}
        y1={chromeH}
        x2={w}
        y2={chromeH}
        stroke={stroke}
        strokeOpacity={0.5}
        strokeWidth={1}
      />
      <g data-archik-frontend-chrome="" transform="translate(8, 7)">
        <circle r={2.2} cx={0} cy={0} fill="var(--archik-node-chrome-dot)" />
        <circle r={2.2} cx={7} cy={0} fill="var(--archik-node-chrome-dot)" />
        <circle r={2.2} cx={14} cy={0} fill="var(--archik-node-chrome-dot)" />
      </g>
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
