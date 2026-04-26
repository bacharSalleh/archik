import type { PositionedNode } from "../../layout/types.ts";
import { fitText, STACK_CHAR_PX } from "../../layout/text.ts";
import { KIND_META } from "../kindPalette.ts";

type Props = {
  node: PositionedNode;
  selected?: boolean;
  /** Container nesting depth — drives the body tint. */
  depth?: number;
};

const COMPACT_HEADER_HEIGHT = 24;
const ICON_INSET = 10;
const TEXT_INSET = 28;

/**
 * Compact "chip" rendering for the canvas's compact view mode.
 *
 *   * Leaf node       → small rounded rect, kind icon (in kind colour)
 *                       on the left, name in the middle.
 *   * Container with  → header strip (icon + name) plus a solid-bordered
 *     children          body that ELK fills with the children. Depth
 *                       tinting matches the detailed-mode CustomNode so
 *                       Notifications-inside-Backend still reads as
 *                       nested at a glance.
 *   * Empty container → dashed placeholder card (rare, but a `module`
 *                       with no children is just a stub).
 */
export function CompactNode({
  node,
  selected,
  depth = 0,
}: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const meta = KIND_META[node.kind];
  const Icon = meta.icon;

  const isExternal = node.kind === "external";

  // Any node with children renders as a container chip — leaf chip
  // shapes have no body to fit children inside.
  if (node.children.length > 0) {
    return <ContainerChip node={node} selected={!!selected} depth={depth} />;
  }
  // Empty module/custom is a placeholder reminder.
  if (node.kind === "module" || node.kind === "custom") {
    return <PlaceholderChip node={node} selected={!!selected} />;
  }

  const stroke = selected
    ? "var(--archik-selected)"
    : isExternal
      ? "var(--archik-node-stroke-soft)"
      : "var(--archik-node-stroke)";
  const fill = isExternal
    ? "var(--archik-node-fill-tinted)"
    : "var(--archik-node-fill)";
  const radius = node.kind === "queue" ? Math.min(h / 2, 18) : 8;

  return (
    <g className={`archik-node archik-node--${node.kind} archik-node--compact`}>
      <rect
        className={selected ? "archik-selected-glow" : undefined}
        width={w}
        height={h}
        rx={radius}
        ry={radius}
        fill={fill}
        stroke={stroke}
        strokeWidth={selected ? 1.8 : 1.4}
        strokeDasharray={isExternal && !selected ? "5 4" : undefined}
      />
      <g
        transform={`translate(${ICON_INSET}, ${h / 2 - 7})`}
        pointerEvents="none"
        aria-hidden="true"
      >
        <Icon size={13} color={meta.color} strokeWidth={1.9} />
      </g>
      <text
        x={TEXT_INSET}
        y={h / 2 + 4}
        fontSize={12}
        fontWeight={600}
        fill="var(--archik-node-text)"
      >
        {fitText(node.name, Math.max(0, w - TEXT_INSET - 8), STACK_CHAR_PX)}
      </text>
    </g>
  );
}

function ContainerChip({
  node,
  selected,
  depth,
}: {
  node: PositionedNode;
  selected: boolean;
  depth: number;
}): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const meta = KIND_META[node.kind];
  const Icon = meta.icon;

  const tintOpacity = Math.min(0.04 + depth * 0.035, 0.14);
  const headerOpacity = Math.min(0.55 + depth * 0.08, 0.85);
  const stroke = selected
    ? "var(--archik-selected)"
    : "var(--archik-container-border)";
  const innerW = Math.max(0, w - 12 - 22 /* icon + gutter */);
  const displayName = fitText(node.name, innerW, STACK_CHAR_PX);

  return (
    <g
      className={`archik-node archik-node--${node.kind} archik-node--compact archik-node--container`}
    >
      <rect
        className={selected ? "archik-selected-glow" : undefined}
        width={w}
        height={h}
        rx={6}
        ry={6}
        fill={meta.color}
        fillOpacity={tintOpacity}
        stroke={stroke}
        strokeWidth={selected ? 1.8 : 1.2}
      />
      <path
        d={headerPath(w, COMPACT_HEADER_HEIGHT, 6)}
        fill={meta.color}
        fillOpacity={headerOpacity * 0.18}
      />
      <line
        x1={0}
        y1={COMPACT_HEADER_HEIGHT}
        x2={w}
        y2={COMPACT_HEADER_HEIGHT}
        stroke={stroke}
        strokeOpacity={0.45}
        strokeWidth={1}
      />
      <g
        transform={`translate(${ICON_INSET}, ${COMPACT_HEADER_HEIGHT / 2 - 6})`}
        pointerEvents="none"
        aria-hidden="true"
      >
        <Icon size={12} color={meta.color} strokeWidth={1.9} />
      </g>
      <text
        x={TEXT_INSET}
        y={COMPACT_HEADER_HEIGHT / 2 + 4}
        fontSize={12}
        fontWeight={600}
        fill="var(--archik-node-text)"
      >
        {displayName}
      </text>
    </g>
  );
}

function PlaceholderChip({
  node,
  selected,
}: {
  node: PositionedNode;
  selected: boolean;
}): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const meta = KIND_META[node.kind];
  const Icon = meta.icon;
  const stroke = selected
    ? "var(--archik-selected)"
    : "var(--archik-node-stroke-soft)";
  return (
    <g
      className={`archik-node archik-node--${node.kind} archik-node--compact`}
    >
      <rect
        className={selected ? "archik-selected-glow" : undefined}
        width={w}
        height={h}
        rx={6}
        ry={6}
        fill="transparent"
        stroke={stroke}
        strokeOpacity={selected ? 1 : 0.55}
        strokeWidth={selected ? 1.8 : 1.2}
        strokeDasharray={selected ? undefined : "4 4"}
      />
      <g
        transform={`translate(${ICON_INSET}, ${h / 2 - 7})`}
        pointerEvents="none"
        aria-hidden="true"
      >
        <Icon size={13} color={meta.color} strokeWidth={1.8} />
      </g>
      <text
        x={TEXT_INSET}
        y={h / 2 + 4}
        fontSize={11}
        fontWeight={600}
        fill="var(--archik-node-caption)"
      >
        {fitText(node.name, Math.max(0, w - TEXT_INSET - 8), STACK_CHAR_PX)}
      </text>
    </g>
  );
}

function headerPath(w: number, h: number, r: number): string {
  return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h} H 0 V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
}
