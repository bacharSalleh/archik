import { Info } from "lucide-react";
import type { NodeKind } from "../domain/types.ts";

type CenterProps = {
  cx: number;
  cy: number;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function InfoIcon({
  cx,
  cy,
  size = 12,
  color = "var(--archik-fg-dim)",
  strokeWidth = 1.8,
}: CenterProps): React.ReactElement {
  return (
    <g
      transform={`translate(${cx - size / 2}, ${cy - size / 2})`}
      pointerEvents="none"
      aria-hidden="true"
    >
      <Info size={size} color={color} strokeWidth={strokeWidth} />
    </g>
  );
}

export type IconAnchors = {
  /** Visual center of the right-hand icon tray (info / pin / future). */
  right: { x: number; y: number };
};

/**
 * Icon-tray center on the right of the header bar. Header band is
 * y=0..HEADER_HEIGHT (28px); icons sit at y=14. For curved shapes
 * (queue capsule) the tray pulls inward to clear the rounded ends.
 */
export function iconAnchorsFor(
  kind: NodeKind,
  width: number,
  height: number,
): IconAnchors {
  const HEADER_MID = 14;
  switch (kind) {
    case "queue": {
      const r = Math.min(height / 2, 28);
      return { right: { x: width - r - 4, y: HEADER_MID } };
    }
    default:
      return { right: { x: width - 14, y: HEADER_MID } };
  }
}
