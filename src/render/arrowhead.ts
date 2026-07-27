/**
 * Arrowhead geometry, drawn as explicit paths instead of SVG <marker>.
 *
 * Why not markers: the only way to tint a marker from its referencing
 * line is `context-stroke`, which WebKit (Safari, and every iOS browser)
 * doesn't implement — arrowheads render black-on-black there and look
 * "missing". Explicit paths take the stroke color directly and work
 * everywhere.
 *
 * All helpers take the tip point and the point the edge arrives FROM
 * (the previous bend / start point), and return an SVG path `d`. A
 * degenerate (zero-length) segment yields an empty string.
 */

export type ArrowPoint = { x: number; y: number };

type Frame = { ux: number; uy: number; px: number; py: number; len: number };

function frame(tip: ArrowPoint, from: ArrowPoint): Frame | null {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return null;
  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular (90° counter-clockwise).
  return { ux, uy, px: -uy, py: ux, len };
}

const num = (n: number): string => String(Math.round(n * 100) / 100);

/** Filled triangle head (runtime edges, selection). */
export function filledArrowPath(
  tip: ArrowPoint,
  from: ArrowPoint,
  length = 10,
  halfWidth = 4,
): string {
  const f = frame(tip, from);
  if (!f) return "";
  const bx = tip.x - f.ux * length;
  const by = tip.y - f.uy * length;
  return `M ${num(bx + f.px * halfWidth)} ${num(by + f.py * halfWidth)} L ${num(tip.x)} ${num(tip.y)} L ${num(bx - f.px * halfWidth)} ${num(by - f.py * halfWidth)} Z`;
}

/** Open chevron head (dependencies, reads/uses). Stroke-only path. */
export function openArrowPath(
  tip: ArrowPoint,
  from: ArrowPoint,
  length = 10,
  halfWidth = 4.5,
): string {
  const f = frame(tip, from);
  if (!f) return "";
  const bx = tip.x - f.ux * length;
  const by = tip.y - f.uy * length;
  return `M ${num(bx + f.px * halfWidth)} ${num(by + f.py * halfWidth)} L ${num(tip.x)} ${num(tip.y)} L ${num(bx - f.px * halfWidth)} ${num(by - f.py * halfWidth)}`;
}

/** Large unfilled triangle — UML generalization / realization head. */
export function triangleArrowPath(
  tip: ArrowPoint,
  from: ArrowPoint,
  length = 14,
  halfWidth = 6,
): string {
  return filledArrowPath(tip, from, length, halfWidth);
}

/**
 * UML composition diamond. Sits at the *owner* end of a `has_a` edge:
 * `at` is the start point of the edge, `to` the next point along it.
 */
export function diamondArrowPath(
  at: ArrowPoint,
  to: ArrowPoint,
  length = 14,
  halfWidth = 4.5,
): string {
  const f = frame(to, at);
  if (!f) return "";
  const midX = at.x + f.ux * (length / 2);
  const midY = at.y + f.uy * (length / 2);
  const backX = at.x + f.ux * length;
  const backY = at.y + f.uy * length;
  return `M ${num(at.x)} ${num(at.y)} L ${num(midX + f.px * halfWidth)} ${num(midY + f.py * halfWidth)} L ${num(backX)} ${num(backY)} L ${num(midX - f.px * halfWidth)} ${num(midY - f.py * halfWidth)} Z`;
}
