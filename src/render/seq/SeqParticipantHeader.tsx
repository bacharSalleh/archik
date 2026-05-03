import { KIND_META } from "../kindPalette.ts";
import type { NodeKind } from "../../domain/types.ts";
import type { LayoutedParticipant } from "./seqLayout.ts";
import { PARTICIPANT_HEADER_HEIGHT } from "./seqLayout.ts";

type Props = {
  participant: LayoutedParticipant;
  nodeKind?: NodeKind;
};

const CHIP_H = 36;
const MIN_CHIP_W = 128;
const CHAR_W = 7;
const ICON_EXTRA = 20;
const H_PAD = 24;

export function SeqParticipantHeader({ participant, nodeKind }: Props): React.ReactElement {
  const meta = nodeKind ? KIND_META[nodeKind] : undefined;
  const color = meta?.color ?? "var(--archik-fg-muted)";
  const chipY = (PARTICIPANT_HEADER_HEIGHT - CHIP_H) / 2;
  const IconComponent = meta?.icon;
  const chipW = Math.max(MIN_CHIP_W, participant.label.length * CHAR_W + H_PAD + (IconComponent ? ICON_EXTRA : 0));
  const chipHalfW = chipW / 2;
  const textX = IconComponent ? chipHalfW + ICON_EXTRA / 2 : chipHalfW;
  const status = participant.status;
  const opacity = status === "proposed" ? 0.55 : status === "deprecated" ? 0.35 : 1;
  const strokeDasharray = status === "proposed" || status === "deprecated" ? "4 3" : undefined;

  return (
    <g transform={`translate(${participant.cx - chipHalfW}, ${chipY})`} opacity={opacity}>
      <rect
        width={chipW}
        height={CHIP_H}
        rx={8}
        fill="var(--archik-node-fill)"
        stroke={color}
        strokeWidth={1.4}
        {...(strokeDasharray !== undefined ? { strokeDasharray } : {})}
      />
      {IconComponent && (
        <g transform={`translate(${H_PAD / 2}, ${(CHIP_H - 14) / 2})`}>
          <IconComponent size={14} color={color} strokeWidth={1.5} />
        </g>
      )}
      <text
        x={textX}
        y={CHIP_H / 2 + 4}
        textAnchor="middle"
        fontSize={12}
        fontWeight={500}
        fill="var(--archik-fg)"
        fontFamily="inherit"
      >
        {participant.label}
      </text>
    </g>
  );
}
