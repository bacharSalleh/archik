import type { PositionedNode } from "../../layout/types.ts";
import { fitText, NAME_CHAR_PX, STACK_CHAR_PX } from "../../layout/text.ts";
import { KIND_META } from "../kindPalette.ts";

const TEXT_PADDING = 36;
const HEADER_OFFSET = 18;

type Props = { node: PositionedNode; selected?: boolean };

/**
 * Cloud silhouette — three overlapping bumps on the top and a
 * rounded bottom. Used for `cloud` (managed cloud service). Reads
 * instantly as "external managed thing" without us needing the
 * dashed border that `external` uses.
 */
export function CloudNode({ node, selected }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const meta = KIND_META[node.kind];
  const Icon = meta.icon;

  const stroke = selected
    ? "var(--archik-selected)"
    : "var(--archik-node-stroke)";
  const strokeWidth = selected ? 1.8 : 1.4;

  const hasStack = node.stack !== undefined;
  const innerW = Math.max(0, w - TEXT_PADDING);
  const displayName = fitText(node.name, innerW, NAME_CHAR_PX);
  const displayStack = hasStack
    ? fitText(node.stack as string, innerW, STACK_CHAR_PX)
    : "";

  const cx = w / 2;
  const bodyMid = h * 0.55;
  const nameY = hasStack ? bodyMid - 4 : bodyMid + 4;
  const stackY = bodyMid + 14;

  return (
    <g className={`archik-node archik-node--cloud`}>
      <path
        className={selected ? "archik-selected-glow" : undefined}
        d={cloudPath(w, h)}
        fill="var(--archik-node-fill)"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Kind icon, top-left of the body. */}
      <g
        transform={`translate(18, ${HEADER_OFFSET - 6})`}
        pointerEvents="none"
        aria-hidden="true"
      >
        <Icon size={14} color={meta.color} strokeWidth={1.9} />
      </g>
      {/* KIND tag, centred near the top. */}
      <text
        x={cx}
        y={HEADER_OFFSET + 4}
        textAnchor="middle"
        fontSize={9.5}
        fontWeight={600}
        letterSpacing="0.12em"
        fill="var(--archik-node-caption)"
      >
        {node.kind.toUpperCase()}
      </text>
      <text
        x={cx}
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
          x={cx}
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

/**
 * Stylised cloud silhouette inscribed in a `w` × `h` rect. Three
 * cumulus bumps along the top, gently rounded sides, flat-ish
 * bottom that lifts slightly at the corners.
 */
function cloudPath(w: number, h: number): string {
  // All coordinates are normalised to the bounding box so the cloud
  // scales with the node size.
  const top = h * 0.18;          // where the bumps start
  const bottom = h - 4;
  const leftBump = w * 0.22;
  const midBumpL = w * 0.42;
  const midBumpR = w * 0.62;
  const rightBump = w * 0.82;
  const sideRadius = h * 0.45;

  return [
    `M ${sideRadius} ${bottom}`,
    // Bottom edge
    `L ${w - sideRadius} ${bottom}`,
    // Right side, curving up
    `Q ${w - 4} ${bottom} ${w - 4} ${bottom - sideRadius * 0.6}`,
    `Q ${w - 2} ${h * 0.48} ${rightBump + h * 0.18} ${h * 0.34}`,
    // Right bump
    `Q ${rightBump + h * 0.18} ${top * 0.4} ${rightBump} ${top}`,
    // Valley between right bump and middle-right bump
    `Q ${midBumpR + h * 0.05} ${top + h * 0.1} ${midBumpR} ${top - h * 0.04}`,
    // Middle-right bump (the tallest one — peak)
    `Q ${(midBumpR + midBumpL) / 2} ${-h * 0.06} ${midBumpL} ${top - h * 0.04}`,
    // Valley between middle bumps
    `Q ${midBumpL - h * 0.05} ${top + h * 0.12} ${leftBump} ${top + h * 0.04}`,
    // Left bump
    `Q ${leftBump - h * 0.22} ${top * 0.5} ${4} ${h * 0.42}`,
    // Left side, curving down to start
    `Q ${4} ${bottom - sideRadius * 0.6} ${sideRadius} ${bottom}`,
    `Z`,
  ].join(" ");
}
