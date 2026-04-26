/**
 * Approximate character widths for the SVG text styles used by node
 * cards and edge labels. These constants are tuned to the renderer's
 * font choices — bump them if you change fontSize/weight there.
 *
 * SVG layout happens before the DOM exists, so we can't measure
 * `getComputedTextLength()`. Estimates are good enough to size cards
 * and reserve label space; the renderer truncates with the same
 * constants so what gets drawn matches what was reserved.
 */
export const NAME_CHAR_PX = 7.4; // fontSize 13, weight 600
export const STACK_CHAR_PX = 5.9; // fontSize 11, weight 400
export const LABEL_CHAR_PX = 5.9; // fontSize 11, weight 500
export const LABEL_HEIGHT = 14;

export function estimateTextWidth(text: string, charPx: number): number {
  return text.length * charPx;
}

/**
 * Truncate `text` so its rendered width fits within `maxWidth`,
 * appending an ellipsis when shortening is needed.
 */
export function fitText(
  text: string,
  maxWidth: number,
  charPx: number,
): string {
  if (maxWidth <= 0) return "";
  const max = Math.floor(maxWidth / charPx);
  if (text.length <= max) return text;
  if (max <= 1) return "…";
  return text.slice(0, max - 1) + "…";
}
