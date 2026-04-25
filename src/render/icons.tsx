import { Info } from "lucide-react";
import type { NodeKind } from "../domain/types.ts";

/**
 * Icon coordinates throughout the renderer are expressed as VISUAL
 * CENTERS (cx, cy). Each helper handles its own offset to align that
 * center with the icon's bounding box. Keeps anchor math consistent
 * across kind tags and lucide icons even though their natural origin
 * differs.
 */
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
  strokeWidth = 1.6,
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
  /** Visual center of the kind tag (top-left zone). */
  left: { x: number; y: number };
  /** Visual center of the info / status icon (top-right zone). */
  right: { x: number; y: number };
};

export function iconAnchorsFor(
  kind: NodeKind,
  width: number,
  height: number,
): IconAnchors {
  // Most shapes share the same header band — a 24px strip with the
  // KIND label centered, kind tag on the left, status icons on the
  // right. Anchor centers live at the strip's vertical midpoint
  // (y=12) at +/- 12px from the edges.
  const HEADER_MID = 12;

  switch (kind) {
    case "database": {
      // Cylinder: header is INSIDE the body just below the top ellipse.
      const ry = Math.min(10, height / 8);
      const cy = ry * 2 + 12;
      return {
        left: { x: 12, y: cy },
        right: { x: width - 12, y: cy },
      };
    }
    case "queue": {
      // Capsule: header is in the straight band between the rounded ends.
      const r = Math.min(height / 2, 28);
      return {
        left: { x: r + 4, y: HEADER_MID },
        right: { x: width - r - 4, y: HEADER_MID },
      };
    }
    case "frontend": {
      // Chrome dots take x=8..22 of the header bar. Tag sits at x=36,
      // info on the far right, both vertically centered in the header.
      return {
        left: { x: 36, y: HEADER_MID },
        right: { x: width - 12, y: HEADER_MID },
      };
    }
    case "service":
    case "cache":
    case "external":
    case "function":
    case "custom":
    default:
      return {
        left: { x: 12, y: HEADER_MID },
        right: { x: width - 12, y: HEADER_MID },
      };
  }
}
