import type { LayoutedSeqDocument, LayoutedStep } from "./seqLayout.ts";
import { ACTIVATION_W, PARTICIPANT_HEADER_HEIGHT, SEQ_MARKER_FILLED, SEQ_MARKER_OPEN } from "./seqLayout.ts";
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
      <defs>
        <FilledTriangle id={SEQ_MARKER_FILLED} />
        <OpenTriangle id={SEQ_MARKER_OPEN} />
      </defs>
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
        {activations.map((a, i) => (
          <rect
            key={i}
            x={a.cx - ACTIVATION_W / 2}
            y={a.startY}
            width={ACTIVATION_W}
            height={a.endY - a.startY}
            fill="var(--archik-node-fill)"
            stroke="var(--archik-node-stroke)"
            strokeWidth={1}
            rx={2}
          />
        ))}
        {steps.map((step) => <RenderStep key={step.id} step={step} {...(onRefClick !== undefined ? { onRefClick } : {})} />)}
      </g>
    </svg>
  );
}
