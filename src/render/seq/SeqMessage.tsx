import type { LayoutedMessage } from "./seqLayout.ts";
import { filledArrowPath, openArrowPath } from "../arrowhead.ts";

const SELF_LOOP_W = 32;
const SELF_LOOP_H = 20;
const LABEL_OFFSET_Y = -6;
const STROKE = "var(--archik-edge-filled)";

export function SeqMessage({ msg }: { msg: LayoutedMessage }): React.ReactElement {
  const isReturn = msg.arrow === "return";
  const isAsync = msg.arrow === "async";
  const isCreate = msg.arrow === "create";
  const dashed = isReturn || isCreate;
  const isDestroy = msg.arrow === "destroy";
  const openHead = isReturn || isAsync;
  const opacity = msg.status === "proposed" ? 0.5 : msg.status === "deprecated" ? 0.35 : 1;

  const head = (tip: { x: number; y: number }, from: { x: number; y: number }): React.ReactElement =>
    openHead ? (
      <path
        data-archik-arrowhead="end"
        d={openArrowPath(tip, from)}
        fill="none"
        stroke={STROKE}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ) : (
      <path
        data-archik-arrowhead="end"
        d={filledArrowPath(tip, from)}
        fill={STROKE}
      />
    );

  if (msg.isSelf) {
    const x = msg.fromCx;
    const y = msg.y;
    const d = `M ${x} ${y} L ${x + SELF_LOOP_W} ${y} L ${x + SELF_LOOP_W} ${y + SELF_LOOP_H} L ${x} ${y + SELF_LOOP_H}`;
    return (
      <g opacity={opacity}>
        <path d={d} fill="none" stroke={STROKE} strokeWidth={1.4} />
        {head({ x, y: y + SELF_LOOP_H }, { x: x + SELF_LOOP_W, y: y + SELF_LOOP_H })}
        <text x={x + SELF_LOOP_W + 6} y={y + SELF_LOOP_H / 2 + 4} fontSize={11} fill="var(--archik-fg)" fontFamily="inherit">
          {msg.label}
        </text>
      </g>
    );
  }

  const leftToRight = msg.fromCx < msg.toCx;
  const arrowX2 = leftToRight ? msg.toCx - 6 : msg.toCx + 6;
  const labelX = (msg.fromCx + msg.toCx) / 2;

  return (
    <g opacity={opacity}>
      <line
        x1={msg.fromCx}
        y1={msg.y}
        x2={arrowX2}
        y2={msg.y}
        stroke={STROKE}
        strokeWidth={1.4}
        strokeDasharray={dashed ? "4 4" : undefined}
      />
      {!isDestroy && head({ x: msg.toCx, y: msg.y }, { x: msg.fromCx, y: msg.y })}
      <text x={labelX} y={msg.y + LABEL_OFFSET_Y} textAnchor="middle" fontSize={11} fill="var(--archik-fg)" fontFamily="inherit">
        {isCreate && "«create» "}
        {msg.label}
      </text>
      {msg.arrow === "destroy" && (
        <g transform={`translate(${msg.toCx - 6}, ${msg.y - 6})`}>
          <line x1={0} y1={0} x2={12} y2={12} stroke="var(--archik-fg-muted)" strokeWidth={1.5} />
          <line x1={12} y1={0} x2={0} y2={12} stroke="var(--archik-fg-muted)" strokeWidth={1.5} />
        </g>
      )}
    </g>
  );
}
