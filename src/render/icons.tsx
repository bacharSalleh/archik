import { Info } from "lucide-react";

/**
 * Wraps a lucide icon at a specific (x, y) anchor inside an SVG.
 * Uses nested <svg> via a positioning <g>; lucide renders its own <svg>
 * with its own viewBox, which becomes a contained viewport.
 */
type IconProps = {
  x: number;
  y: number;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function InfoIcon({
  x,
  y,
  size = 12,
  color = "var(--archik-fg-dim)",
  strokeWidth = 1.6,
}: IconProps): React.ReactElement {
  return (
    <g
      transform={`translate(${x}, ${y})`}
      pointerEvents="none"
      aria-hidden="true"
    >
      <Info size={size} color={color} strokeWidth={strokeWidth} />
    </g>
  );
}

/**
 * Per-kind anchor points for the icon zone of every shape.
 * left  — kind tag (small color dot)
 * right — info / status icons (top-right, but adjusted to clear curved
 *         edges on cylinders, capsules, etc.)
 */
import type { NodeKind } from "../domain/types.ts";

export type IconAnchors = {
  left: { x: number; y: number };
  right: { x: number; y: number };
};

export function iconAnchorsFor(
  kind: NodeKind,
  width: number,
  height: number,
): IconAnchors {
  switch (kind) {
    case "database": {
      // Cylinder: top ellipse curves until y = ry*2 (2*ry below the top).
      // Park icons just below that curve so they sit inside the body.
      const ry = Math.min(10, height / 8);
      const y = ry * 2 + 4;
      return {
        left: { x: 10, y },
        right: { x: width - 22, y },
      };
    }
    case "queue": {
      // Capsule: rounded ends from x=0 to x=radius. Icons live inside the
      // straight middle section, well clear of the curves.
      const r = Math.min(height / 2, 24);
      const y = 8;
      return {
        left: { x: r + 2, y },
        right: { x: width - r - 14, y },
      };
    }
    case "frontend": {
      // Chrome bar runs from y=0..14 with three dots on the left.
      // Icons go in the chrome bar's empty right half.
      return {
        left: { x: width - 38, y: 3 },
        right: { x: width - 20, y: 3 },
      };
    }
    case "function": {
      // λ glyph at left of header; icons sit beside / opposite it.
      return {
        left: { x: 30, y: 8 },
        right: { x: width - 22, y: 8 },
      };
    }
    case "cache":
    case "external":
    case "custom":
    case "service":
    default:
      return {
        left: { x: 8, y: 8 },
        right: { x: width - 22, y: 8 },
      };
  }
}
