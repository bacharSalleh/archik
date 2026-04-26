import type { PositionedNode } from "../../layout/types.ts";
import { fitText, NAME_CHAR_PX, STACK_CHAR_PX } from "../../layout/text.ts";
import { HEADER_HEIGHT, NodeHeader } from "./NodeHeader.tsx";

type Props = { node: PositionedNode; selected?: boolean };

export function QueueNode({ node, selected }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const radius = Math.min(h / 2, 28);
  const hasStack = node.stack !== undefined;
  const bodyMid = HEADER_HEIGHT + (h - HEADER_HEIGHT) / 2;
  const nameY = hasStack ? bodyMid - 4 : bodyMid + 4;
  const stackY = bodyMid + 14;
  // Round caps already eat ~radius on each side; reserve that plus
  // a little breathing room before truncating text.
  const innerW = Math.max(0, w - 2 * radius - 8);
  const displayName = fitText(node.name, innerW, NAME_CHAR_PX);
  const displayStack = hasStack
    ? fitText(node.stack as string, innerW, STACK_CHAR_PX)
    : "";
  const stroke = selected
    ? "var(--archik-selected)"
    : "var(--archik-node-stroke)";

  return (
    <g className="archik-node archik-node--queue">
      <rect
        className={selected ? "archik-selected-glow" : undefined}
        width={w}
        height={h}
        rx={radius}
        ry={radius}
        fill="var(--archik-node-fill)"
        stroke={stroke}
        strokeWidth={selected ? 1.8 : 1.4}
      />
      <line
        x1={radius}
        y1={HEADER_HEIGHT}
        x2={w - radius}
        y2={HEADER_HEIGHT}
        stroke={stroke}
        strokeOpacity={0.25}
        strokeWidth={1}
      />
      <NodeHeader
        kind="queue"
        iconAt={{ cx: radius + 8, cy: HEADER_HEIGHT / 2 }}
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
      {hasStack && (
        <text
          x={w / 2}
          y={stackY}
          textAnchor="middle"
          fontSize={11}
          fill="var(--archik-node-text-dim)"
        >
          {displayStack}
        </text>
      )}
    </g>
  );
}
