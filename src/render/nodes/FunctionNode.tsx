import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode; selected?: boolean };

export function FunctionNode({ node, selected }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const hasStack = node.stack !== undefined;
  // λ + kind + info live in the top 22px; center text below.
  const bodyMid = 22 + (h - 22) / 2;
  const nameY = hasStack ? bodyMid - 4 : bodyMid + 4;
  const stackY = bodyMid + 14;
  const stroke = selected
    ? "var(--archik-selected)"
    : "var(--archik-node-stroke)";

  return (
    <g className="archik-node archik-node--function">
      <rect
        className={selected ? "archik-selected-glow" : undefined}
        width={w}
        height={h}
        rx={14}
        ry={14}
        fill="var(--archik-node-fill)"
        stroke={stroke}
        strokeWidth={selected ? 1.8 : 1.4}
      />
      <text
        x={12}
        y={20}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize={14}
        fontWeight={700}
        fill="var(--archik-node-caption)"
      >
        λ
      </text>
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
