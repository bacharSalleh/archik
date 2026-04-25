import { KIND_META } from "../kindPalette.ts";
import type { NodeKind } from "../../domain/types.ts";

export const HEADER_HEIGHT = 28;

/**
 * Header strip composition: lucide kind icon (left), KIND label
 * (center), info-icon tray (right, drawn by NodeRenderer). Every shape
 * provides its own (cx, cy) for the icon and label so cylinders /
 * capsules / chrome bars can place them inside their natural body.
 */
type Props = {
  kind: NodeKind;
  iconAt: { cx: number; cy: number };
  labelAt: { cx: number; cy: number };
};

export function NodeHeader({
  kind,
  iconAt,
  labelAt,
}: Props): React.ReactElement {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const ICON_SIZE = 14;
  return (
    <>
      <g
        transform={`translate(${iconAt.cx - ICON_SIZE / 2}, ${
          iconAt.cy - ICON_SIZE / 2
        })`}
        pointerEvents="none"
        aria-hidden="true"
      >
        <Icon size={ICON_SIZE} color={meta.color} strokeWidth={1.8} />
      </g>
      <text
        x={labelAt.cx}
        y={labelAt.cy}
        textAnchor="middle"
        fontSize={9.5}
        fontWeight={600}
        letterSpacing="0.12em"
        fill="var(--archik-node-caption)"
      >
        {kind.toUpperCase()}
      </text>
    </>
  );
}
