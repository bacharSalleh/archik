import type { PositionedNode } from "../../layout/types.ts";
import { fitText, NAME_CHAR_PX, STACK_CHAR_PX } from "../../layout/text.ts";
import { HEADER_HEIGHT, NodeHeader } from "./NodeHeader.tsx";

const TEXT_PADDING = 24;

type Props = { node: PositionedNode; selected?: boolean };

/**
 * DatabaseNode renders as a rounded-rect card now (the cylinder was
 * cute but ate space the user wants for icons/tags). The lucide
 * Database icon in the header preserves the visual "this is a
 * database" cue without eating real estate.
 */
export function DatabaseNode({ node, selected }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const hasStack = node.stack !== undefined;
  const bodyMid = HEADER_HEIGHT + (h - HEADER_HEIGHT) / 2;
  const nameY = hasStack ? bodyMid - 4 : bodyMid + 4;
  const stackY = bodyMid + 14;
  const innerW = Math.max(0, w - TEXT_PADDING);
  const displayName = fitText(node.name, innerW, NAME_CHAR_PX);
  const displayStack = hasStack
    ? fitText(node.stack as string, innerW, STACK_CHAR_PX)
    : "";
  return (
    <g className="archik-node archik-node--database">
      <rect
        className={selected ? "archik-selected-glow" : undefined}
        width={w}
        height={h}
        rx={10}
        ry={10}
        fill="var(--archik-node-fill)"
        stroke={selected ? "var(--archik-selected)" : "var(--archik-node-stroke)"}
        strokeWidth={selected ? 1.8 : 1.4}
      />
      <line
        x1={0}
        y1={HEADER_HEIGHT}
        x2={w}
        y2={HEADER_HEIGHT}
        stroke="var(--archik-node-stroke)"
        strokeOpacity={0.25}
        strokeWidth={1}
      />
      <NodeHeader
        kind="database"
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
