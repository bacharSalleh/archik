import type { LayoutedMessage } from "./seqLayout.ts";

const SELF_LOOP_W = 32;
const SELF_LOOP_H = 20;
const LABEL_OFFSET_Y = -6;
const ACTIVATION_W = 8;
const ACTIVATION_H = 20;

export function SeqMessage({ msg }: { msg: LayoutedMessage }): React.ReactElement {
  const isReturn = msg.arrow === "return";
  const isAsync = msg.arrow === "async";
  const isCreate = msg.arrow === "create";
  const dashed = isReturn || isCreate;
  const markerId = isReturn || isAsync ? "seq-arrow-open" : "seq-arrow-filled";
  const opacity = msg.status === "proposed" ? 0.5 : msg.status === "deprecated" ? 0.35 : 1;

  if (msg.isSelf) {
    const x = msg.fromCx;
    const y = msg.y;
    const d = `M ${x} ${y} L ${x + SELF_LOOP_W} ${y} L ${x + SELF_LOOP_W} ${y + SELF_LOOP_H} L ${x} ${y + SELF_LOOP_H}`;
    return (
      <g opacity={opacity}>
        <path d={d} fill="none" stroke="var(--archik-edge-filled)" strokeWidth={1.4} markerEnd={`url(#${markerId})`} />
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
      {msg.activate && (
        <rect
          x={msg.toCx - ACTIVATION_W / 2}
          y={msg.y - 2}
          width={ACTIVATION_W}
          height={ACTIVATION_H}
          fill="var(--archik-node-fill)"
          stroke="var(--archik-node-stroke)"
          strokeWidth={1}
          rx={2}
        />
      )}
      <line
        x1={msg.fromCx}
        y1={msg.y}
        x2={arrowX2}
        y2={msg.y}
        stroke="var(--archik-edge-filled)"
        strokeWidth={1.4}
        strokeDasharray={dashed ? "4 4" : undefined}
        markerEnd={`url(#${markerId})`}
      />
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
