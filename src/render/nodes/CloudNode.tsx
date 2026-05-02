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
 * circular-arc bumps along the top, rounded bottom corners, flat
 * bottom. All control points stay inside the bounding box at any
 * sensible aspect ratio.
 */
function cloudPath(w: number, h: number): string {
  const margin = 2;
  const baseY = h - margin;
  const bumpBase = h * 0.62;
  const cornerR = Math.min(h * 0.18, 14);
  const span = w - 2 * margin;

  // Cap bumps so they never escape the top of the bbox on wide nodes.
  const maxR = h * 0.5;
  const r1 = Math.min(span * 0.15, maxR * 0.85);
  const r2 = Math.min(span * 0.18, maxR);
  const r3 = Math.min(span * 0.15, maxR * 0.85);

  // Distribute leftover horizontal space as flat sections between
  // bumps so wide nodes keep cloud-like proportions instead of being
  // a single stretched bump.
  const totalBumpW = 2 * (r1 + r2 + r3);
  const slack = Math.max(0, span - totalBumpW) / 4;

  const x0 = margin;
  const x3 = w - margin;
  const a = x0 + slack;
  const b = a + 2 * r1;
  const c = b + slack;
  const d = c + 2 * r2;
  const e = d + slack;
  const f = e + 2 * r3;

  // Path traverses counter-clockwise: bottom-left corner → bottom →
  // bottom-right corner → up right side → bumps right-to-left along
  // bumpBase (sweep flag 0 makes them bulge up) → down to start.
  return [
    `M ${x0} ${baseY - cornerR}`,
    `Q ${x0} ${baseY} ${x0 + cornerR} ${baseY}`,
    `L ${x3 - cornerR} ${baseY}`,
    `Q ${x3} ${baseY} ${x3} ${baseY - cornerR}`,
    `L ${x3} ${bumpBase}`,
    `L ${f} ${bumpBase}`,
    `A ${r3} ${r3} 0 0 0 ${e} ${bumpBase}`,
    `L ${d} ${bumpBase}`,
    `A ${r2} ${r2} 0 0 0 ${c} ${bumpBase}`,
    `L ${b} ${bumpBase}`,
    `A ${r1} ${r1} 0 0 0 ${a} ${bumpBase}`,
    `L ${x0} ${bumpBase}`,
    `Z`,
  ].join(" ");
}
