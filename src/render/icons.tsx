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
 * it doesn't read as "drill into a sub-architecture." A single icon
 * stands in for ALL linked seq files; the optional `count` overlays a
 * small badge on the top-right when there are multiple. Click opens
 * the first seq file (the rest are reachable via NodeInspector). The
 * tooltip lists every file name so hover-discovery still works.
 */
export function SeqIcon({
  cx,
  cy,
  files,
  count,
  size = 14,
}: {
  cx: number;
  cy: number;
  files: ReadonlyArray<{ path: string; label: string }>;
  count?: number;
  size?: number;
}): React.ReactElement {
  const tooltip =
    files.length === 1
      ? `Open sequence diagram → ${files[0]!.label} (${files[0]!.path})`
      : `${files.length} sequence diagrams on this node:\n` +
        files.map((f) => `  • ${f.label}`).join("\n") +
        `\nClick to open the first; the rest live in the inspector.`;
  return (
    <g
      transform={`translate(${cx - size / 2}, ${cy - size / 2})`}
      style={{ cursor: "pointer" }}
    >
      <title>{tooltip}</title>
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
      {count !== undefined && count > 1 && (
        <g pointerEvents="none">
          {/* Notification-style pill: a small filled circle with a
              canvas-coloured outer ring so it reads cleanly against
              both the icon body (same indigo) and the canvas
              background. White glyph on a solid indigo fill gives
              the count high contrast at typical zoom. */}
          <circle
            cx={size + 1}
            cy={1}
            r={6}
            fill="var(--archik-canvas)"
          />
          <circle
            cx={size + 1}
            cy={1}
            r={5}
            fill="var(--archik-status-proposed)"
          />
          <text
            x={size + 1}
            y={3.5}
            fontSize={8}
            fontWeight={700}
            fill="#ffffff"
            textAnchor="middle"
          >
            {count}
          </text>
        </g>
      )}
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
    case "module":
    case "custom":
      // Containers run a CustomNode header bar (32px) with a KIND tag
      // on the right and a divider line at y=32. Anchoring tray icons
      // INSIDE the header area collides with the KIND tag and / or
      // overlaps the divider (looks chopped — see issue with the (i)
      // icon sitting on the line). Park them in the empty strip
      // between the divider (y=32) and ELK's first child (y=48 due to
      // CONTAINER_PADDING.top in elkAdapter). y=42 centers them in
      // that 16px gap with a touch more space below.
      return { right: { x: width - 14, y: 42 } };
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
