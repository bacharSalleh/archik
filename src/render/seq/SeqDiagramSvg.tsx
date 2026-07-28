import type { LayoutedSeqDocument, LayoutedStep } from "./seqLayout.ts";
import { ACTIVATION_W, PARTICIPANT_HEADER_HEIGHT } from "./seqLayout.ts";
import { SeqParticipantHeader } from "./SeqParticipantHeader.tsx";
import { SeqLifeline } from "./SeqLifeline.tsx";
import { SeqMessage } from "./SeqMessage.tsx";
import { SeqGroupFrame } from "./SeqGroupFrame.tsx";
import { SeqNote } from "./SeqNote.tsx";

function RenderStep({ step, onRefClick }: { step: LayoutedStep; onRefClick?: (f: string) => void }): React.ReactElement | null {
  if (step.type === "message") return <SeqMessage msg={step} />;
  if (step.type === "note") return <SeqNote note={step} />;
  if (step.type === "group") {
    return (
      <SeqGroupFrame
        group={step}
        {...(onRefClick !== undefined ? { onRefClick } : {})}
        renderStep={(s) => <RenderStep key={s.id} step={s} {...(onRefClick !== undefined ? { onRefClick } : {})} />}
      />
    );
  }
  return null;
}

type Props = {
  laid: LayoutedSeqDocument;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  onRefClick?: (seqFile: string) => void;
};

export function SeqDiagramSvg({ laid, svgRef, onRefClick }: Props): React.ReactElement {
  const { participants, steps, activations, totalWidth, totalHeight } = laid;

  return (
    <svg
      ref={svgRef}
      width={totalWidth}
      height={totalHeight}
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ fontFamily: "var(--archik-font, system-ui)" }}
    >
      {participants.map((p) => (
        <SeqLifeline key={p.id} participant={p} />
      ))}
      {participants.map((p) => (
        <SeqParticipantHeader
          key={p.id}
          participant={p}
          {...(p.kind !== undefined ? { nodeKind: p.kind } : {})}
        />
      ))}
      <g transform={`translate(0, ${PARTICIPANT_HEADER_HEIGHT})`}>
        {activations.map((a) => (
          <rect
            key={`${a.cx}-${a.startY}`}
            x={a.cx - ACTIVATION_W / 2}
            y={a.startY}
            width={ACTIVATION_W}
            height={a.endY - a.startY}
            fill="var(--archik-surface)"
            stroke="var(--archik-fg-muted)"
            strokeWidth={1.2}
            rx={2}
          />
        ))}
        {steps.map((step) => <RenderStep key={step.id} step={step} {...(onRefClick !== undefined ? { onRefClick } : {})} />)}
      </g>
    </svg>
  );
}
