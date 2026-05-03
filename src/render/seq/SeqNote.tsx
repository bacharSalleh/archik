import type { LayoutedNote } from "./seqLayout.ts";

const FOLD = 10;

export function SeqNote({ note }: { note: LayoutedNote }): React.ReactElement {
  const { x, y, width, height, text } = note;
  const opacity = note.status === "proposed" ? 0.55 : note.status === "deprecated" ? 0.35 : 1;

  return (
    <g opacity={opacity}>
      <path
        d={`M ${x} ${y} L ${x + width - FOLD} ${y} L ${x + width} ${y + FOLD} L ${x + width} ${y + height} L ${x} ${y + height} Z`}
        fill="var(--archik-node-fill)"
        stroke="var(--archik-node-stroke)"
        strokeWidth={1.2}
      />
      <path
        d={`M ${x + width - FOLD} ${y} L ${x + width - FOLD} ${y + FOLD} L ${x + width} ${y + FOLD}`}
        fill="none"
        stroke="var(--archik-node-stroke)"
        strokeWidth={1.2}
      />
      <text
        x={x + 8}
        y={y + 8 + 11}
        fontSize={11}
        fill="var(--archik-fg)"
        fontFamily="inherit"
      >
        {text}
      </text>
    </g>
  );
}
