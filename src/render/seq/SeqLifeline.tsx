import type { LayoutedParticipant } from "./seqLayout.ts";
import { PARTICIPANT_HEADER_HEIGHT } from "./seqLayout.ts";

type Props = {
  participant: LayoutedParticipant;
  totalHeight: number;
};

export function SeqLifeline({ participant, totalHeight }: Props): React.ReactElement {
  return (
    <line
      x1={participant.cx}
      y1={PARTICIPANT_HEADER_HEIGHT}
      x2={participant.cx}
      y2={totalHeight}
      stroke="var(--archik-node-stroke)"
      strokeWidth={1}
      strokeDasharray="4 4"
      opacity={0.5}
    />
  );
}
