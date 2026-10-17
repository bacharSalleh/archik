/**
 * Pure "fit to view" math for the canvas's initial zoom. Kept separate
 * from Canvas.tsx so it can be unit-tested without jsdom layout support.
 */

export type Size = { width: number; height: number };

/**
 * Largest zoom at which `content` (its size at 100%) fits inside
 * `viewport`, capped at 1 so small diagrams are not magnified, then
 * clamped into [min, max]. A viewport with no size yet (not laid out,
 * or jsdom) yields 1.
 */
export function fitZoom(
  content: Size,
  viewport: Size,
  min: number,
  max: number,
): number {
  if (
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    content.width <= 0 ||
    content.height <= 0
  ) {
    return 1;
  }
  const fit = Math.min(
    1,
    viewport.width / content.width,
    viewport.height / content.height,
  );
  return Math.max(min, Math.min(max, fit));
}
