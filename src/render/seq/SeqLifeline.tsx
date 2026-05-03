import type { LayoutedParticipant } from "./seqLayout.ts";
import { PARTICIPANT_HEADER_HEIGHT } from "./seqLayout.ts";

type Props = {
  participant: LayoutedParticipant;
};

export function SeqLifeline({ participant }: Props): React.ReactElement {
  const status = participant.status;
  const opacity = status === "proposed" ? 0.3 : status === "deprecated" ? 0.2 : 0.5;
  return (
    <line
      x1={participant.cx}
      y1={PARTICIPANT_HEADER_HEIGHT}
      x2={participant.cx}
      y2={participant.lifelineEndY}
      stroke="var(--archik-node-stroke)"
      strokeWidth={1}
      strokeDasharray="4 4"
      opacity={opacity}
    />
  );
}
