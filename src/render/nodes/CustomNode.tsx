import type { PositionedNode } from "../../layout/types.ts";
import { fitText, NAME_CHAR_PX } from "../../layout/text.ts";
import { KIND_META } from "../kindPalette.ts";

type Props = {
  node: PositionedNode;
  selected?: boolean;
  /** 0 = root container, +1 per nesting level. Drives the depth tint. */
  depth?: number;
};

const HEADER_HEIGHT = 32;
const HEADER_PADDING_X = 14;
const ICON_SIZE = 14;

/**
 * `module` and `custom` nodes are containers — they hold other nodes
 * via `parentId` and ELK lays out their children inside their bounds.
 *
 * Visual identity:
 *   * Solid header bar (kind icon + name + KIND tag)
 *   * Subtle body fill that gets a touch more opaque per nesting level,
 *     so a container nested inside another container reads as "lifted"
 *     rather than identical-but-overlapping.
 *   * Solid 1px border (not dashed) — dashed reads as "incomplete" and
 *     was the main reason the previous container UI felt buggy.
 *
 * When the container has no children we fall back to a leaf-like
 * appearance (no header bar, just the name centred in a tinted card),
 * because an empty `module` is just a placeholder.
 */
export function CustomNode({
  node,
  selected,
  depth = 0,
}: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const hasChildren = node.children.length > 0;

  if (!hasChildren) return <PlaceholderCard node={node} selected={!!selected} />;

  const meta = KIND_META[node.kind];
  const Icon = meta.icon;

  // Depth tint: 0 → faintest, clamps at depth 3. Steps are large enough
  // that two same-kind containers nested inside each other are clearly
  // distinguishable — the previous 0.035 step was barely visible.
  const tintOpacity = Math.min(0.04 + depth * 0.06, 0.22);
  const headerOpacity = Math.min(0.55 + depth * 0.12, 0.95);

  const stroke = selected
    ? "var(--archik-selected)"
    : "var(--archik-container-border)";
  const strokeWidth = selected ? 1.8 : 1.2;

  // Reserve some inner padding either side of the header for the
  // KIND tag on the right and the icon + name on the left.
  const innerW = Math.max(0, w - HEADER_PADDING_X * 2 - 60 /* KIND tag */);
  const displayName = fitText(node.name, innerW, NAME_CHAR_PX);

  return (
    <g className={`archik-node archik-node--${node.kind} archik-node--container`}>
      {/* Body — subtle tint behind the children. pointer-events:none so
          edges routed through the container stay clickable; the header
          strip below still catches clicks for selecting the container. */}
      <rect
        className={selected ? "archik-selected-glow" : undefined}
        width={w}
        height={h}
        rx={8}
        ry={8}
        fill={meta.color}
        fillOpacity={tintOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
        pointerEvents="none"
      />

      {/* Elevation cue at depth ≥ 1: an inset stroke in the kind color
          so two same-kind containers nested inside each other don't blur
          into one tinted blob. Opacity scales with depth and clamps. */}
      {depth >= 1 && w > 8 && h > 8 && (
        <rect
          x={3}
          y={3}
          width={w - 6}
          height={h - 6}
          rx={6}
          ry={6}
          fill="none"
          stroke={meta.color}
          strokeOpacity={Math.min(0.18 + (depth - 1) * 0.06, 0.32)}
          strokeWidth={1}
          pointerEvents="none"
        />
      )}

      {/* Header strip — opaque so the title sits above the tinted body. */}
      <path
        d={headerPath(w, HEADER_HEIGHT, 8)}
        fill={meta.color}
        fillOpacity={headerOpacity * 0.18}
      />
      <line
        x1={0}
        y1={HEADER_HEIGHT}
        x2={w}
        y2={HEADER_HEIGHT}
        stroke={stroke}
        strokeOpacity={0.45}
        strokeWidth={1}
      />

      {/* Kind icon, top-left. */}
      <g
        transform={`translate(${HEADER_PADDING_X}, ${HEADER_HEIGHT / 2 - ICON_SIZE / 2})`}
        pointerEvents="none"
        aria-hidden="true"
      >
        <Icon size={ICON_SIZE} color={meta.color} strokeWidth={1.9} />
      </g>

      {/* Container name. */}
      <text
        x={HEADER_PADDING_X + ICON_SIZE + 8}
        y={HEADER_HEIGHT / 2 + 4}
        fontSize={13}
        fontWeight={600}
        fill="var(--archik-node-text)"
      >
        {displayName}
      </text>

      {/* KIND tag, top-right. */}
      <text
        x={w - HEADER_PADDING_X}
        y={HEADER_HEIGHT / 2 + 3}
        textAnchor="end"
        fontSize={9.5}
        fontWeight={600}
        letterSpacing="0.12em"
        fill="var(--archik-node-caption)"
      >
        {node.kind.toUpperCase()}
      </text>
    </g>
  );
}

/** Path for a rect with only the *top* corners rounded (matches body rx). */
function headerPath(w: number, h: number, r: number): string {
  return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h} H 0 V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
}

/**
 * An empty container is just a placeholder reminder — render it as a
 * dashed tinted card so the user notices it has no children yet.
 */
function PlaceholderCard({
  node,
  selected,
}: {
  node: PositionedNode;
  selected: boolean;
}): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const meta = KIND_META[node.kind];
  const stroke = selected
    ? "var(--archik-selected)"
    : "var(--archik-node-stroke-soft)";
  return (
    <g className={`archik-node archik-node--${node.kind}`}>
      <rect
        className={selected ? "archik-selected-glow" : undefined}
        width={w}
        height={h}
        rx={8}
        ry={8}
        fill="var(--archik-node-fill-tinted)"
        stroke={stroke}
        strokeWidth={selected ? 1.8 : 1.2}
        strokeDasharray={selected ? undefined : "5 4"}
      />
      <text
        x={w / 2}
        y={h / 2 + 4}
        textAnchor="middle"
        fontSize={12}
        fontWeight={600}
        fill={meta.color}
      >
        {node.name}
      </text>
    </g>
  );
}
