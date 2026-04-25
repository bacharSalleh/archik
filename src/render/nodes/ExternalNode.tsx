import type { PositionedNode } from "../../layout/types.ts";

type Props = { node: PositionedNode; selected?: boolean };

const MAX_DESC_CHARS = 22;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function ExternalNode({ node, selected }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const hasDescription = node.description !== undefined;
  const captionY = 14;
  const nameY = hasDescription ? h * 0.5 + 2 : h / 2 + 6;
  const descriptionY = h - 10;
  const stroke = selected
    ? "var(--archik-selected)"
    : "var(--archik-node-stroke-soft)";

  return (
    <g className="archik-node archik-node--external">
      <rect
        className={selected ? "archik-selected-glow" : undefined}
        width={w}
        height={h}
        rx={8}
        ry={8}
        fill="var(--archik-node-fill-tinted)"
        stroke={stroke}
        strokeWidth={selected ? 1.8 : 1.2}
        strokeDasharray={selected ? undefined : "6 4"}
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
          {truncate(node.description!, MAX_DESC_CHARS)}
        </text>
      )}
    </g>
  );
}
