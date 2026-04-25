import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode };

export function FunctionNode({ node }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const hasStack = node.stack !== undefined;
  const nameY = hasStack ? h / 2 - 4 : h / 2 + 4;
  const stackY = h / 2 + 14;

  return (
    <g className="archik-node archik-node--function">
      <rect
        width={w}
        height={h}
        rx={14}
        ry={14}
        fill="var(--archik-node-fill)"
        stroke="var(--archik-node-stroke)"
        strokeWidth={1.4}
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
