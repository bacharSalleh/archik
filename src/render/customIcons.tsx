type Props = {
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
};

const baseProps = (
  size: number | string,
  color: string,
  strokeWidth: number | string,
) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: color,
  strokeWidth: typeof strokeWidth === "string" ? strokeWidth : strokeWidth,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

/**
 * Socket — a US-style three-prong electrical outlet. Two slots on top,
 * a ground hole below, all inside a rounded outlet face. Reads as the
 * "receptacle an adapter plugs into" for hexagonal-architecture ports.
 */
export function SocketIcon({
  size = 16,
  color = "currentColor",
  strokeWidth = 1.8,
}: Props): React.ReactElement {
  return (
    <svg {...baseProps(size, color, strokeWidth)} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3.5" ry="3.5" />
      <line x1="9" y1="9" x2="9" y2="13" />
      <line x1="15" y1="9" x2="15" y2="13" />
      <circle cx="12" cy="16.5" r="1" fill={color} stroke="none" />
    </svg>
  );
}

/**
 * Interface — angle brackets enclosing a slightly-italic lowercase i,
 * echoing the &lt;i&gt; convention for "interface" / contract.
 */
export function InterfaceIcon({
  size = 16,
  color = "currentColor",
  strokeWidth = 1.8,
}: Props): React.ReactElement {
  return (
    <svg {...baseProps(size, color, strokeWidth)} aria-hidden="true">
      <path d="M 7.5 6 L 3.5 12 L 7.5 18" />
      <path d="M 16.5 6 L 20.5 12 L 16.5 18" />
      <circle cx="13" cy="8.6" r="0.9" fill={color} stroke="none" />
      <line x1="13" y1="11" x2="11" y2="16.5" />
    </svg>
  );
}
