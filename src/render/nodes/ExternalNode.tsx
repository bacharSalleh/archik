import type { PositionedNode } from "../../layout/types.ts";
import { fitText, NAME_CHAR_PX, STACK_CHAR_PX } from "../../layout/text.ts";
import { HEADER_HEIGHT, NodeHeader } from "./NodeHeader.tsx";

const TEXT_PADDING = 24;

type Props = { node: PositionedNode; selected?: boolean };

export function ExternalNode({ node, selected }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const hasDescription = node.description !== undefined;
  const bodyTop = HEADER_HEIGHT;
  const bodyMid = bodyTop + (h - bodyTop) / 2;
  const nameY = hasDescription ? bodyMid - 2 : bodyMid + 4;
  const descriptionY = h - 12;
  const innerW = Math.max(0, w - TEXT_PADDING);
  const displayName = fitText(node.name, innerW, NAME_CHAR_PX);
  const displayDescription = hasDescription
    ? fitText(node.description as string, innerW, STACK_CHAR_PX)
    : "";
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
      <NodeHeader
        kind="external"
        iconAt={{ cx: 18, cy: HEADER_HEIGHT / 2 }}
        labelAt={{ cx: w / 2, cy: HEADER_HEIGHT / 2 + 3 }}
      />
      <text
        x={w / 2}
        y={nameY}
        textAnchor="middle"
        fontSize={13}
        fontWeight={600}
        fill="var(--archik-node-text)"
      >
        {displayName}
      </text>
      {hasDescription && (
        <text
          x={w / 2}
          y={descriptionY}
          textAnchor="middle"
          fontSize={10}
          fill="var(--archik-node-text-dim)"
        >
          {displayDescription}
        </text>
      )}
    </g>
  );
}
