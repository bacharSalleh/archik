import type { PositionedNode } from "../../layout/types.ts";
import { KIND_META } from "../kindPalette.ts";

type Props = { node: PositionedNode; selected?: boolean };

/**
 * Compact "chip" rendering used by the canvas's compact view mode.
 * Just the kind icon (in kind colour) and the node name, on a small
 * rounded rect. Description / notes / stack are not shown — open the
 * inspector or switch to detailed view for those.
 *
 * Containers (custom / module) keep their dashed transparent fill so
 * grouping still reads visually even in compact mode.
 */
export function CompactNode({ node, selected }: Props): React.ReactElement {
  const w = node.width;
  const h = node.height;
  const meta = KIND_META[node.kind];
  const Icon = meta.icon;

  const isContainer = node.kind === "module" || node.kind === "custom";
  const isExternal = node.kind === "external";
  const stroke = selected
    ? "var(--archik-selected)"
    : isExternal || isContainer
      ? "var(--archik-node-stroke-soft)"
      : "var(--archik-node-stroke)";

  const fill = isContainer
    ? "transparent"
    : isExternal
      ? "var(--archik-node-fill-tinted)"
      : "var(--archik-node-fill)";

  if (isContainer) {
    return (
      <g className={`archik-node archik-node--${node.kind} archik-node--compact`}>
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
          transform={`translate(10, 14)`}
          pointerEvents="none"
          aria-hidden="true"
        >
          <Icon size={13} color={meta.color} strokeWidth={1.8} />
        </g>
        <text
          x={30}
          y={18}
          fontSize={11}
          letterSpacing="0.04em"
          fontWeight={600}
          fill="var(--archik-node-caption)"
        >
          {node.name}
        </text>
      </g>
    );
  }

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
        strokeDasharray={
          isExternal && !selected ? "5 4" : undefined
        }
      />
      <g
        transform={`translate(10, ${h / 2 - 7})`}
        pointerEvents="none"
        aria-hidden="true"
      >
        <Icon size={13} color={meta.color} strokeWidth={1.9} />
      </g>
      <text
        x={28}
        y={h / 2 + 4}
        fontSize={12}
        fontWeight={600}
        fill="var(--archik-node-text)"
      >
        {node.name}
      </text>
    </g>
  );
}
