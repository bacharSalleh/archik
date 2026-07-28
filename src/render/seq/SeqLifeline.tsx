import type { LayoutedParticipant } from "./seqLayout.ts";
import { PARTICIPANT_HEADER_HEIGHT } from "./seqLayout.ts";

type Props = {
  participant: LayoutedParticipant;
};

export function SeqLifeline({ participant }: Props): React.ReactElement {
  const status = participant.status;
  // UML lifelines must stay clearly readable — the previous 0.5-opacity
  // node-stroke line vanished on the true-black theme.
  const opacity = status === "proposed" ? 0.35 : status === "deprecated" ? 0.25 : 0.6;
  return (
    <line
      x1={participant.cx}
      y1={PARTICIPANT_HEADER_HEIGHT}
      x2={participant.cx}
      y2={participant.lifelineEndY}
      stroke="var(--archik-fg-muted)"
      strokeWidth={1.2}
      strokeDasharray="6 5"
      opacity={opacity}
    />
  );
}
