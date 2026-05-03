import type { LayoutedSeqDocument, LayoutedStep } from "./seqLayout.ts";
import { PARTICIPANT_HEADER_HEIGHT, SEQ_MARKER_FILLED, SEQ_MARKER_OPEN } from "./seqLayout.ts";
import { SeqParticipantHeader } from "./SeqParticipantHeader.tsx";
import { SeqLifeline } from "./SeqLifeline.tsx";
import { SeqMessage } from "./SeqMessage.tsx";
import { SeqGroupFrame } from "./SeqGroupFrame.tsx";
import { SeqNote } from "./SeqNote.tsx";

function FilledTriangle({ id }: { id: string }): React.ReactElement {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
    </marker>
  );
}

function OpenTriangle({ id }: { id: string }): React.ReactElement {
  return (
    <marker id={id} viewBox="0 0 12 12" refX="11" refY="6" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 1 1 L 11 6 L 1 11" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinejoin="round" />
    </marker>
  );
}

function RenderStep({ step }: { step: LayoutedStep }): React.ReactElement | null {
  if (step.type === "message") return <SeqMessage msg={step} />;
  if (step.type === "note") return <SeqNote note={step} />;
  if (step.type === "group") {
    return (
      <SeqGroupFrame
        group={step}
        renderStep={(s) => <RenderStep key={s.id} step={s} />}
      />
    );
  }
  return null;
}

type Props = {
  laid: LayoutedSeqDocument;
  svgRef?: React.RefObject<SVGSVGElement | null>;
};

export function SeqDiagramSvg({ laid, svgRef }: Props): React.ReactElement {
  const { participants, steps, totalWidth, totalHeight } = laid;

  return (
    <svg
      ref={svgRef}
      width={totalWidth}
      height={totalHeight}
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ fontFamily: "var(--archik-font, system-ui)" }}
    >
      <defs>
        <FilledTriangle id={SEQ_MARKER_FILLED} />
        <OpenTriangle id={SEQ_MARKER_OPEN} />
      </defs>
      {participants.map((p) => (
        <SeqLifeline key={p.id} participant={p} />
      ))}
      {participants.map((p) => (
        <SeqParticipantHeader key={p.id} participant={p} nodeKind={p.kind} />
      ))}
      <g transform={`translate(0, ${PARTICIPANT_HEADER_HEIGHT})`}>
        {steps.map((step) => <RenderStep key={step.id} step={step} />)}
      </g>
    </svg>
  );
}
