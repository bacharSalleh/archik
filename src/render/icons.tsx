import { Info, StickyNote } from "lucide-react";
import type { NodeKind } from "../domain/types.ts";

const TRAY_ICON_SIZE = 12;
const TRAY_SLOT_SPACING = 18;

type CenterProps = {
  cx: number;
  cy: number;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

function PositionedIcon({
  Icon,
  cx,
  cy,
  size = TRAY_ICON_SIZE,
  color,
  strokeWidth = 1.8,
}: CenterProps & { Icon: typeof Info }): React.ReactElement {
  return (
    <g
      transform={`translate(${cx - size / 2}, ${cy - size / 2})`}
      pointerEvents="none"
      aria-hidden="true"
    >
      <Icon
        size={size}
        color={color ?? "var(--archik-fg-dim)"}
        strokeWidth={strokeWidth}
      />
    </g>
  );
}

export function InfoIcon(props: CenterProps): React.ReactElement {
  return <PositionedIcon Icon={Info} {...props} />;
}

export function NotesIcon(props: CenterProps): React.ReactElement {
  return <PositionedIcon Icon={StickyNote} {...props} />;
}

export type IconAnchors = {
  /** Center of the rightmost slot in the right-hand icon tray. */
  right: { x: number; y: number };
};

export function iconAnchorsFor(
  kind: NodeKind,
  width: number,
  height: number,
): IconAnchors {
  const HEADER_MID = 14;
  switch (kind) {
    case "queue": {
      const r = Math.min(height / 2, 28);
      return { right: { x: width - r - 4, y: HEADER_MID } };
    }
    default:
      return { right: { x: width - 14, y: HEADER_MID } };
  }
}

/** Compute centers for each tray slot, packed right-to-left. */
export function trayCenters(
  rightmost: { x: number; y: number },
  count: number,
): Array<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, i) => ({
    x: rightmost.x - i * TRAY_SLOT_SPACING,
    y: rightmost.y,
  }));
}
