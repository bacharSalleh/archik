import type { LayoutedNote } from "./seqLayout.ts";

const FOLD = 10;

function wrapNoteText(text: string, maxWidth: number): string[] {
  const charsPerLine = Math.max(10, Math.floor(maxWidth / 6.5));
  if (text.length <= charsPerLine) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + (current ? " " : "") + word).length > charsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3); // max 3 lines to keep the note box small
}

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
      {wrapNoteText(text, width - 16).map((line, i) => (
        <text
          key={i}
          x={x + 8}
          y={y + 8 + 11 + i * 13}
          fontSize={11}
          fill="var(--archik-fg)"
          fontFamily="inherit"
        >
          {line}
        </text>
      ))}
    </g>
  );
}
