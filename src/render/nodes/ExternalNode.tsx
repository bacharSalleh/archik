import type { PositionedNode } from "../../layout/types.ts";
import { HEADER_HEIGHT, HeaderLabel } from "./NodeHeader.tsx";

type Props = { node: PositionedNode; selected?: boolean };

const MAX_DESC_CHARS = 28;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function ExternalNode({ node, selected }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const hasDescription = node.description !== undefined;
  const bodyTop = HEADER_HEIGHT;
  // When description present: name slightly above body center, description
  // near the bottom. When absent: name vertically centered in body.
  const bodyMid = bodyTop + (h - bodyTop) / 2;
  const nameY = hasDescription ? bodyMid - 2 : bodyMid + 4;
  const descriptionY = h - 12;
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
      <line
        x1={6}
        y1={HEADER_HEIGHT}
        x2={w - 6}
        y2={HEADER_HEIGHT}
        stroke={stroke}
        strokeOpacity={0.25}
        strokeWidth={1}
      />
      <HeaderLabel cx={w / 2} cy={15} label="EXTERNAL" />
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
