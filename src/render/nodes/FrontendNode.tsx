import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode };

export function FrontendNode({ node }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const chromeH = 14;
  const bodyTop = chromeH;
  const bodyH = h - chromeH;
  const hasStack = node.stack !== undefined;
  const nameY = bodyTop + (hasStack ? bodyH / 2 - 4 : bodyH / 2 + 4);
  const stackY = bodyTop + bodyH / 2 + 14;

  return (
    <g className="archik-node archik-node--frontend">
      <rect
        width={w}
        height={h}
        rx={8}
        ry={8}
        fill="#ffffff"
        stroke="#0f172a"
        strokeWidth={1.4}
      />
      <path
        data-archik-frontend-chrome=""
        d={`M 0 ${chromeH} H ${w}`}
        stroke="#0f172a"
        strokeWidth={1}
        strokeOpacity={0.5}
      />
      <g data-archik-frontend-chrome="" transform="translate(8, 7)">
        <circle r={2.2} cx={0} cy={0} fill="#cbd5f5" />
        <circle r={2.2} cx={7} cy={0} fill="#cbd5f5" />
        <circle r={2.2} cx={14} cy={0} fill="#cbd5f5" />
      </g>
      <text
        x={w / 2}
        y={nameY}
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={13}
        fontWeight={600}
        fill="#0f172a"
      >
        {node.name}
      </text>
      {hasStack && (
        <text
          x={w / 2}
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
