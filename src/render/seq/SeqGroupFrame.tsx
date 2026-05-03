import type { LayoutedGroup, LayoutedStep } from "./seqLayout.ts";

type Props = {
  group: LayoutedGroup;
  renderStep: (step: LayoutedStep) => React.ReactElement | null;
};

const KIND_COLORS: Record<string, string> = {
  alt: "#6366f1",
  opt: "#0ea5e9",
  loop: "#10b981",
  par: "#f59e0b",
  break: "#ef4444",
  ref: "#8b5cf6",
};

const TAB_W = 36;
const TAB_H = 18;

export function SeqGroupFrame({ group, renderStep }: Props): React.ReactElement {
  const color = KIND_COLORS[group.kind] ?? "var(--archik-fg-muted)";
  const opacity = group.status === "proposed" ? 0.55 : group.status === "deprecated" ? 0.35 : 1;

  return (
    <g opacity={opacity}>
      <rect
        x={group.x}
        y={group.y}
        width={group.width}
        height={group.height}
        rx={4}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        opacity={0.6}
      />
      <rect x={group.x} y={group.y} width={TAB_W} height={TAB_H} rx={4} fill={color} opacity={0.8} />
      <text
        x={group.x + 6}
        y={group.y + TAB_H - 5}
        fontSize={10}
        fontWeight={600}
        fill="#fff"
        fontFamily="inherit"
      >
        {group.kind}
      </text>
      {(group.condition ?? group.label) && (
        <text
          x={group.x + TAB_W + 6}
          y={group.y + TAB_H - 5}
          fontSize={10}
          fill={color}
          fontFamily="inherit"
        >
          {group.condition ?? group.label}
        </text>
      )}
      {group.branches.map((branch, i) => (
        <g key={i}>
          {branch.label && (
            <text
              x={group.x + 6}
              y={branch.startY + 12}
              fontSize={10}
              fill={color}
              fontFamily="inherit"
            >
              {branch.label}
            </text>
          )}
          {branch.steps.map((s) => renderStep(s))}
          {branch.dividerY !== undefined && (
            <line
              x1={group.x}
              y1={branch.dividerY}
              x2={group.x + group.width}
              y2={branch.dividerY}
              stroke={color}
              strokeWidth={1}
              strokeDasharray="4 2"
              opacity={0.5}
            />
          )}
        </g>
      ))}
    </g>
  );
}
