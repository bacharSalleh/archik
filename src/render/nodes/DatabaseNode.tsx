import type { PositionedNode } from "../../layout/types.ts";
import { fitText, NAME_CHAR_PX, STACK_CHAR_PX } from "../../layout/text.ts";
import { KIND_META } from "../kindPalette.ts";

const TEXT_PADDING = 28;
// Vertical radius of the top ellipse cap. ~10 reads as a cylinder
// without dominating the body.
const TOP_ELLIPSE_RY = 10;
// Footer strip — where the kind icon + KIND tag sit, like a label
// band on a real bottle. Slim so the body keeps most of the room
// for the name + stack.
const FOOTER_STRIP = 22;

type Props = { node: PositionedNode; selected?: boolean };

/**
 * UML cylinder, top-only variant: top ellipse rim + straight sides
 * + flat bottom. Layout (top → bottom):
 *
 *   - top ellipse rim (the "lid") — kept clean, nothing overlaps it
 *   - body: NAME + optional stack, vertically centred
 *   - divider line
 *   - footer strip: kind icon at left, KIND tag centred (the
 *     description "info" badge from NodeRenderer also lands in this
 *     strip — see iconAnchorsFor in render/icons.tsx)
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

  // Geometry. Sides run from y=ry (under the top ellipse) all the
  // way down to y=h (the flat floor). Footer strip carves the
  // bottom FOOTER_STRIP px out of that for the kind icon + tag.
  const sideFloor = h;
  const footerTop = sideFloor - FOOTER_STRIP;
  const footerMid = (footerTop + sideFloor) / 2;
  const bodyTop = ry + 8;
  const bodyBottom = footerTop;
  const bodyMid = (bodyTop + bodyBottom) / 2;
  const nameY = hasStack ? bodyMid - 4 : bodyMid + 4;
  const stackY = bodyMid + 14;

  return (
    <g className={`archik-node archik-node--database`}>
      {/* Body fill — single path tracing the cylinder outline:
          top arc, right side, flat bottom, left side. */}
      <path
        className={selected ? "archik-selected-glow" : undefined}
        d={cylinderPath(w, h, ry)}
        fill="var(--archik-node-fill)"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Top ellipse rim — drawn ON TOP so the lid reads clearly. */}
      <ellipse
        cx={cx}
        cy={ry}
        rx={w / 2}
        ry={ry}
        fill="var(--archik-node-fill)"
        stroke={stroke}
        strokeWidth={strokeWidth}
      />

      {/* Body: name + optional stack. */}
      <text
        x={cx}
        y={nameY}
        textAnchor="middle"
        fontSize={14}
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

      {/* Divider between body and footer strip. */}
      <line
        x1={4}
        y1={footerTop}
        x2={w - 4}
        y2={footerTop}
        stroke={stroke}
        strokeOpacity={0.45}
        strokeWidth={1}
      />

      {/* Footer strip: kind icon (left) + KIND tag (centred). The
          info / notes badges from NodeRenderer land at the right end
          of this strip — see iconAnchorsFor for the y placement. */}
      <g
        transform={`translate(14, ${footerMid - 7})`}
        pointerEvents="none"
        aria-hidden="true"
      >
        <Icon size={14} color={meta.color} strokeWidth={1.9} />
      </g>
      <text
        x={cx}
        y={footerMid + 4}
        textAnchor="middle"
        fontSize={9.5}
        fontWeight={600}
        letterSpacing="0.12em"
        fill="var(--archik-node-caption)"
      >
        {node.kind.toUpperCase()}
      </text>
    </g>
  );
}

/**
 * SVG path for a flat-bottom cylinder of width `w`, height `h`, with
 * a top ellipse cap of vertical radius `ry`. The bottom corners get
 * the same `r` corner radius as a standard card so the cylinder
 * lines up visually with its neighbours instead of having sharp
 * 90° corners that draw the eye.
 */
const CORNER_R = 10;

function cylinderPath(w: number, h: number, ry: number): string {
  const r = CORNER_R;
  return [
    `M 0 ${ry}`,
    `L 0 ${h - r}`,
    `A ${r} ${r} 0 0 0 ${r} ${h}`,
    `L ${w - r} ${h}`,
    `A ${r} ${r} 0 0 0 ${w} ${h - r}`,
    `L ${w} ${ry}`,
    `A ${w / 2} ${ry} 0 0 0 0 ${ry}`,
    `Z`,
  ].join(" ");
}
