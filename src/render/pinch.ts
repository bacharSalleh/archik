/**
 * Pure pinch-gesture math for the canvas touch handler. Kept separate from
 * Canvas.tsx so it can be unit-tested without jsdom layout/CTM support.
 */

export type PinchPoint = { x: number; y: number };

export function pinchDistance(a: PinchPoint, b: PinchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: PinchPoint, b: PinchPoint): PinchPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Zoom derived from a pinch: scale the zoom captured at gesture start by
 * the distance ratio, then clamp into [min, max]. A degenerate start
 * distance (both fingers on the exact same pixel) yields startZoom —
 * dividing by ~0 would blow the zoom straight to the max clamp.
 */
export function zoomFromPinch(
  startDist: number,
  currentDist: number,
  startZoom: number,
  min: number,
  max: number,
): number {
  if (startDist < 1) return Math.max(min, Math.min(max, startZoom));
  return Math.max(min, Math.min(max, startZoom * (currentDist / startDist)));
}
