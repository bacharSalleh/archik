import type { PositionedDocument, ViewMode } from "../layout/types.ts";
import type { StatusMap } from "../domain/diff.ts";
import { NodeRenderer } from "./NodeRenderer.tsx";
import {
  ARROW_MARKER_CIRCLE,
  ARROW_MARKER_DOUBLE,
  ARROW_MARKER_FILLED,
  ARROW_MARKER_OPEN,
  ARROW_MARKER_SELECTED,
  ARROW_MARKER_UML_DIAMOND_FILLED,
  ARROW_MARKER_UML_TRIANGLE,
  EdgeRenderer,
} from "./EdgeRenderer.tsx";
import {
  EdgeDiffOverlays,
  NodeDiffFrames,
  RemovedNodeDimmer,
} from "./diffOverlay.tsx";

const VIEWBOX_PADDING = 24;

/**
 * Markers use SVG `context-stroke` so the arrow head inherits the line's
 * stroke color — that way per-edge color overrides and structural-vs-flow
 * styles automatically tint the arrow without needing a marker per color.
 *
 * `context-stroke` is supported in modern Chrome / Firefox / Safari.
 */
function FilledTriangleMarker({ id }: { id: string }): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="10"
      refY="5"
      markerWidth="6"
      markerHeight="6"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
    </marker>
  );
}

function OpenTriangleMarker({ id }: { id: string }): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 12 12"
      refX="11"
      refY="6"
      markerWidth="7"
      markerHeight="7"
      orient="auto-start-reverse"
    >
      <path
        d="M 1 1 L 11 6 L 1 11"
        fill="none"
        stroke="context-stroke"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </marker>
  );
}

function FilledCircleMarker({ id }: { id: string }): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerWidth="6"
      markerHeight="6"
      orient="auto"
    >
      <circle cx="5" cy="5" r="4" fill="context-stroke" />
    </marker>
  );
}

function SelectedArrowMarker({ id }: { id: string }): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="10"
      refY="5"
      markerWidth="6"
      markerHeight="6"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--archik-selected)" />
    </marker>
  );
}

/**
 * UML hollow-triangle marker — the "is-a" arrowhead used at the
 * parent end of `extends` (inheritance) and the interface end of
 * `implements` (realisation). Backed with the panel colour so the
 * line passes behind it cleanly.
 */
function UmlTriangleMarker({ id }: { id: string }): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 14 14"
      refX="13"
      refY="7"
      markerWidth="11"
      markerHeight="11"
      orient="auto-start-reverse"
    >
      <path
        d="M 1 1 L 13 7 L 1 13 z"
        fill="var(--archik-panel)"
        stroke="context-stroke"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </marker>
  );
}

/**
 * UML filled-diamond marker — sits at the *owner* end of a
 * composition relationship. We use markerStart for this so it
 * appears at the source (whole) end of the source→target line.
 */
function UmlDiamondFilledMarker({ id }: { id: string }): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 16 10"
      refX="0"
      refY="5"
      markerWidth="12"
      markerHeight="9"
      orient="auto-start-reverse"
    >
      <path
        d="M 0 5 L 8 0 L 16 5 L 8 10 z"
        fill="context-stroke"
        stroke="context-stroke"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </marker>
  );
}

/**
 * Double-tick chevron — used by `grpc` to differentiate from the
 * generic http_call's filled triangle. Reads as "typed RPC" rather
 * than "any HTTP".
 */
function DoubleArrowMarker({ id }: { id: string }): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 14 12"
      refX="13"
      refY="6"
      markerWidth="9"
      markerHeight="8"
      orient="auto-start-reverse"
    >
      <path
        d="M 1 1 L 7 6 L 1 11 M 6 1 L 12 6 L 6 11"
        fill="none"
        stroke="context-stroke"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </marker>
  );
}

type Props = {
  positioned: PositionedDocument;
  className?: string | undefined;
  zoom?: number;
  viewMode?: ViewMode;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  /** Live ghost line during a drag-to-connect interaction. */
  dragGhost?:
    | { fromId: string; pointerX: number; pointerY: number }
    | null;
  selectedNodeIds?: ReadonlySet<string>;
  selectedEdgeIds?: ReadonlySet<string>;
  onSelectNode?:
    | ((id: string, event: React.MouseEvent) => void)
    | undefined;
  onSelectEdge?:
    | ((id: string, event: React.MouseEvent) => void)
    | undefined;
  onSelectNothing?: (() => void) | undefined;
  /** When set, layer per-status diff frames + edge tints over the diagram. */
  diffStatuses?: StatusMap;
};

type InnerProps = {
  positioned: PositionedDocument;
  viewMode?: ViewMode;
  selectedNodeIds?: ReadonlySet<string>;
  selectedEdgeIds?: ReadonlySet<string>;
  onSelectNode?:
    | ((id: string, event: React.MouseEvent) => void)
    | undefined;
  onSelectEdge?:
    | ((id: string, event: React.MouseEvent) => void)
    | undefined;
};

/**
 * The defs + edges + nodes block, without the surrounding <svg>.
 * Reusable from DiffSvg (and any future renderer that wants to layer
 * its own annotations on top of the standard diagram).
 */
export function DiagramInner({
  positioned,
  viewMode = "detailed",
  selectedNodeIds,
  selectedEdgeIds,
  onSelectNode,
  onSelectEdge,
}: InnerProps): React.ReactElement {
  return (
    <>
      <defs>
        <FilledTriangleMarker id={ARROW_MARKER_FILLED} />
        <OpenTriangleMarker id={ARROW_MARKER_OPEN} />
        <FilledCircleMarker id={ARROW_MARKER_CIRCLE} />
        <SelectedArrowMarker id={ARROW_MARKER_SELECTED} />
        <UmlTriangleMarker id={ARROW_MARKER_UML_TRIANGLE} />
        <UmlDiamondFilledMarker id={ARROW_MARKER_UML_DIAMOND_FILLED} />
        <DoubleArrowMarker id={ARROW_MARKER_DOUBLE} />
      </defs>
      <g className="archik-edges">
        {positioned.edges.map((edge) => (
          <EdgeRenderer
            key={edge.id}
            edge={edge}
            {...(selectedEdgeIds !== undefined ? { selectedEdgeIds } : {})}
            {...(onSelectEdge !== undefined ? { onSelectEdge } : {})}
          />
        ))}
      </g>
      <g className="archik-nodes">
        {positioned.roots.map((node) => (
          <NodeRenderer
            key={node.id}
            node={node}
            viewMode={viewMode}
            {...(selectedNodeIds !== undefined ? { selectedNodeIds } : {})}
            {...(onSelectNode !== undefined ? { onSelectNode } : {})}
          />
        ))}
      </g>
    </>
  );
}

function findNodeCenter(
  positioned: PositionedDocument,
  id: string,
): { x: number; y: number } | null {
  const walk = (
    nodes: PositionedDocument["roots"],
    offsetX: number,
    offsetY: number,
  ): { x: number; y: number } | null => {
    for (const n of nodes) {
      if (n.id === id) {
        return {
          x: offsetX + n.x + n.width / 2,
          y: offsetY + n.y + n.height / 2,
        };
      }
      const inner = walk(n.children, offsetX + n.x, offsetY + n.y);
      if (inner) return inner;
    }
    return null;
  };
  return walk(positioned.roots, 0, 0);
}

export function DiagramSvg({
  positioned,
  className,
  zoom = 1,
  viewMode = "detailed",
  svgRef,
  dragGhost,
  selectedNodeIds,
  selectedEdgeIds,
  onSelectNode,
  onSelectEdge,
  onSelectNothing,
  diffStatuses,
}: Props): React.ReactElement {
  const w = Math.max(positioned.width, 1);
  const h = Math.max(positioned.height, 1);
  const vx = -VIEWBOX_PADDING;
  const vy = -VIEWBOX_PADDING;
  const vw = w + VIEWBOX_PADDING * 2;
  const vh = h + VIEWBOX_PADDING * 2;
  const ghostStart = dragGhost
    ? findNodeCenter(positioned, dragGhost.fromId)
    : null;

  return (
    <svg
      ref={svgRef}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width={vw * zoom}
      height={vh * zoom}
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", flexShrink: 0 }}
      onClick={onSelectNothing}
    >
      {diffStatuses && (
        <RemovedNodeDimmer statuses={diffStatuses} scopeClass="archik-diff-base" />
      )}
      <g className={diffStatuses ? "archik-diff-base" : undefined}>
        <DiagramInner
          positioned={positioned}
          viewMode={viewMode}
          {...(selectedNodeIds !== undefined ? { selectedNodeIds } : {})}
          {...(selectedEdgeIds !== undefined ? { selectedEdgeIds } : {})}
          {...(onSelectNode !== undefined ? { onSelectNode } : {})}
          {...(onSelectEdge !== undefined ? { onSelectEdge } : {})}
        />
      </g>
      {diffStatuses && (
        <>
          <EdgeDiffOverlays positioned={positioned} statuses={diffStatuses} />
          <NodeDiffFrames positioned={positioned} statuses={diffStatuses} />
        </>
      )}
      {dragGhost && ghostStart && (
        <g className="archik-drag-ghost" pointerEvents="none">
          <line
            x1={ghostStart.x}
            y1={ghostStart.y}
            x2={dragGhost.pointerX}
            y2={dragGhost.pointerY}
            stroke="var(--archik-selected)"
            strokeWidth={1.6}
            strokeDasharray="6 4"
            strokeLinecap="round"
            opacity={0.85}
          />
          <circle
            cx={dragGhost.pointerX}
            cy={dragGhost.pointerY}
            r={4}
            fill="var(--archik-selected)"
            opacity={0.9}
          />
        </g>
      )}
    </svg>
  );
}
