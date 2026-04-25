import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode };

export function ExternalNode({ node }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const hasDescription = node.description !== undefined;
  const captionY = 14;
  const nameY = hasDescription ? h * 0.5 + 2 : h / 2 + 6;
  const descriptionY = h - 10;

  return (
    <g className="archik-node archik-node--external">
      <rect
        width={w}
        height={h}
        rx={8}
        ry={8}
        fill="var(--archik-node-fill-tinted)"
        stroke="var(--archik-node-stroke-soft)"
        strokeWidth={1.2}
        strokeDasharray="6 4"
      />
      <text
        x={w / 2}
        y={captionY}
        textAnchor="middle"
        fontSize={9}
        letterSpacing="0.08em"
        fill="var(--archik-node-caption)"
      >
        EXTERNAL
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
      {hasDescription && (
        <text
          x={w / 2}
          y={descriptionY}
          textAnchor="middle"
          fontSize={10}
          fill="var(--archik-node-text-dim)"
        >
          {node.description}
        </text>
      )}
    </g>
  );
}
