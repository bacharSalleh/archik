import type { PositionedNode } from "../../layout/types.ts";
import { fitText, NAME_CHAR_PX, STACK_CHAR_PX } from "../../layout/text.ts";
import { KIND_META } from "../kindPalette.ts";

const TEXT_PADDING = 28;
// ry sets how "tall" the elliptical caps look. 12 gives a visible
// cylinder profile without dominating a 96-tall node; below ~10 the
// shape reads as a rounded rect instead of a cylinder.
const TOP_ELLIPSE_RY = 12;
const HEADER_GAP = 6; // breathing room between the top ellipse and the KIND tag

type Props = { node: PositionedNode; selected?: boolean };

/**
 * Classic UML / sysadmin cylinder. Top ellipse + two side lines +
 * bottom curve. The KIND tag, name, and optional stack sit inside
 * the cylinder body. The kind icon overlaps the top ellipse so the
 * shape reads as "database, with the data on top."
 */
export function DatabaseNode({
  node,
  selected,
}: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const cx = w / 2;
  const ry = TOP_ELLIPSE_RY;
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

  // Body extends from y = ry (top of cylinder) to y = h - ry (where the
  // bottom curve starts). Text sits centered in that body region.
  const bodyTop = ry + HEADER_GAP;
  const bodyBottom = h - ry;
  const bodyMid = (bodyTop + bodyBottom) / 2;
  const nameY = hasStack ? bodyMid - 4 : bodyMid + 4;
  const stackY = bodyMid + 14;
  const kindY = ry + 4;

  return (
    <g className={`archik-node archik-node--database`}>
      {/* Body fill — a single path that traces the cylinder outline:
          top ellipse + two sides + bottom curve. */}
      <path
        className={selected ? "archik-selected-glow" : undefined}
        d={cylinderPath(w, h, ry)}
        fill="var(--archik-node-fill)"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* The top ellipse rim — drawn ON TOP so the cylinder's top
          edge reads clearly. */}
      <ellipse
        cx={cx}
        cy={ry}
        rx={w / 2}
        ry={ry}
        fill="var(--archik-node-fill)"
        stroke={stroke}
        strokeWidth={strokeWidth}
      />

      {/* Kind icon at top-left, overlapping the top ellipse. */}
      <g
        transform={`translate(14, ${ry - 7})`}
        pointerEvents="none"
        aria-hidden="true"
      >
        <Icon size={14} color={meta.color} strokeWidth={1.9} />
      </g>

      {/* KIND tag, centered just under the top ellipse. */}
      <text
        x={cx}
        y={kindY + 18}
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
 * SVG path for a cylinder of width `w`, height `h`, with top/bottom
 * ellipse vertical radius `ry`. We draw: down-left side, bottom
 * ellipse curve (front half only), up-right side, top ellipse curve
 * (front half only) closing back to start.
 */
function cylinderPath(w: number, h: number, ry: number): string {
  // Use the long-form arc command: A rx ry x-rotation large-arc sweep x y
  // sweep=0 for the top arc gives us the front half (the part the eye
  // expects to see).
  return [
    `M 0 ${ry}`,
    `L 0 ${h - ry}`,
    `A ${w / 2} ${ry} 0 0 0 ${w} ${h - ry}`,
    `L ${w} ${ry}`,
    `A ${w / 2} ${ry} 0 0 0 0 ${ry}`,
    `Z`,
  ].join(" ");
}
