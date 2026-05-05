import {
  ArrowUpRight,
  ChevronDown,
  GitBranch,
  Info,
  StickyNote,
} from "lucide-react";
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

/**
 * Clickable badge shown on a node that has cross-file edges
 * pointing at another archik file. Tooltip carries the file path;
 * click navigates the canvas to it. One per *unique* referenced
 * file — multiple cross-file edges to the same target collapse
 * into a single icon.
 */
export function CrossFileIcon({
  cx,
  cy,
  filePath,
  fileLabel,
  onClick,
  size = 13,
}: {
  cx: number;
  cy: number;
  filePath: string;
  fileLabel: string;
  onClick?: (e: React.MouseEvent) => void;
  size?: number;
}): React.ReactElement {
  return (
    <g
      transform={`translate(${cx - size / 2}, ${cy - size / 2})`}
      style={{ cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
    >
      <title>{`Cross-file edge → ${fileLabel} (${filePath})`}</title>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={size / 2 + 0.5}
        fill="var(--archik-fg-dim)"
        fillOpacity={0.12}
        stroke="var(--archik-fg-dim)"
        strokeOpacity={0.4}
        strokeWidth={1}
      />
      <g transform={`translate(1, 1)`} pointerEvents="none">
        <ArrowUpRight
          size={size - 2}
          color="var(--archik-fg-muted)"
          strokeWidth={2.2}
        />
      </g>
    </g>
  );
}

/**
 * Clickable badge shown on a node whose `archikFile` points at a
 * sub-architecture. Visually distinct from the read-only info /
 * notes icons (filled circle behind it, accent colour) so users
 * spot it as an affordance rather than decoration.
 */
export function SubArchIcon({
  cx,
  cy,
  onClick,
  size = 14,
}: {
  cx: number;
  cy: number;
  onClick?: (e: React.MouseEvent) => void;
  size?: number;
}): React.ReactElement {
  return (
    <g
      transform={`translate(${cx - size / 2}, ${cy - size / 2})`}
      style={{ cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
    >
      <title>Open sub-architecture</title>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={size / 2 + 0.5}
        fill="var(--archik-accent)"
        fillOpacity={0.16}
        stroke="var(--archik-accent)"
        strokeOpacity={0.45}
        strokeWidth={1}
      />
      <g transform={`translate(1, 1)`} pointerEvents="none">
        <ChevronDown
          size={size - 2}
          color="var(--archik-accent)"
          strokeWidth={2.2}
        />
      </g>
    </g>
  );
}

/**
 * Clickable badge shown on a node whose `seqFiles` list points at one
 * or more sequence diagrams. Same visual treatment as SubArchIcon
 * (filled circle, accent colour) but uses a distinct status colour so
 * it doesn't read as "drill into a sub-architecture." One icon per
 * seq file — clicking opens that file's seq page directly. Tooltip
 * shows the file name.
 */
export function SeqIcon({
  cx,
  cy,
  filePath,
  fileLabel,
  onClick,
  size = 14,
}: {
  cx: number;
  cy: number;
  filePath: string;
  fileLabel: string;
  onClick?: (e: React.MouseEvent) => void;
  size?: number;
}): React.ReactElement {
  return (
    <g
      transform={`translate(${cx - size / 2}, ${cy - size / 2})`}
      style={{ cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
    >
      <title>{`Open sequence diagram → ${fileLabel} (${filePath})`}</title>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={size / 2 + 0.5}
        fill="var(--archik-status-proposed)"
        fillOpacity={0.16}
        stroke="var(--archik-status-proposed)"
        strokeOpacity={0.5}
        strokeWidth={1}
      />
      <g transform={`translate(1, 1)`} pointerEvents="none">
        <GitBranch
          size={size - 2}
          color="var(--archik-status-proposed)"
          strokeWidth={2.2}
        />
      </g>
    </g>
  );
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
    case "database":
      // The database renders its KIND tag in a footer strip at the
      // bottom; the top ellipse stays clean. Anchor the badges in
      // that footer strip, mirroring the ServiceNode header tray.
      return { right: { x: width - 14, y: height - 11 } };
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
