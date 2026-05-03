import { KIND_META } from "../kindPalette.ts";
import type { NodeKind } from "../../domain/types.ts";
import type { LayoutedParticipant } from "./seqLayout.ts";
import { PARTICIPANT_HEADER_HEIGHT } from "./seqLayout.ts";

type Props = {
  participant: LayoutedParticipant;
  nodeKind?: NodeKind;
};

const CHIP_H = 36;
const CHIP_HALF_W = 64;

export function SeqParticipantHeader({ participant, nodeKind }: Props): React.ReactElement {
  const meta = nodeKind ? KIND_META[nodeKind] : undefined;
  const color = meta?.color ?? "var(--archik-fg-muted)";
  const chipY = (PARTICIPANT_HEADER_HEIGHT - CHIP_H) / 2;

  return (
    <g transform={`translate(${participant.cx - CHIP_HALF_W}, ${chipY})`}>
      <rect
        width={CHIP_HALF_W * 2}
        height={CHIP_H}
        rx={8}
        fill="var(--archik-node-fill)"
        stroke={color}
        strokeWidth={1.4}
      />
      <text
        x={CHIP_HALF_W}
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
