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
  switch (kind) {
    case "database": {
      // Cylinder: top ellipse curves until y = ry*2. Park icons just
      // below that curve so they sit visibly inside the body.
      const ry = Math.min(10, height / 8);
      const cy = ry * 2 + 10;
      return {
        left: { x: 12, y: cy },
        right: { x: width - 12, y: cy },
      };
    }
    case "queue": {
      // Capsule: rounded ends from x=0 to x=radius. Icons live inside
      // the straight middle section.
      const r = Math.min(height / 2, 24);
      return {
        left: { x: r + 6, y: 12 },
        right: { x: width - r - 6, y: 12 },
      };
    }
    case "frontend": {
      // Three traffic-light dots fill the left of the chrome bar.
      // Park the kind tag just to their right and the info on the
      // far right of the chrome bar.
      return {
        left: { x: 38, y: 7 },
        right: { x: width - 12, y: 7 },
      };
    }
    case "function": {
      // λ glyph occupies the top-left. Tag goes immediately after it.
      return {
        left: { x: 32, y: 12 },
        right: { x: width - 12, y: 12 },
      };
    }
    case "cache":
    case "external":
    case "service":
    case "custom":
    default:
      return {
        left: { x: 12, y: 12 },
        right: { x: width - 12, y: 12 },
      };
  }
}
