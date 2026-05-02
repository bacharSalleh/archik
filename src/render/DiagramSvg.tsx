import type { PositionedDocument, ViewMode } from "../layout/types.ts";
import type { StatusMap } from "../domain/diff.ts";
import { NodeRenderer } from "./NodeRenderer.tsx";
import {
  ARROW_MARKER_FILLED,
  ARROW_MARKER_OPEN,
  ARROW_MARKER_SELECTED,
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
  onOpenSubFile?: (archikFile: string, label: string) => void;
  onCrossFileNavigate?: (archikFile: string, label: string) => void;
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
  onOpenSubFile?: (archikFile: string, label: string) => void;
  onCrossFileNavigate?: (archikFile: string, label: string) => void;
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
  onOpenSubFile,
  onCrossFileNavigate,
}: InnerProps): React.ReactElement {
  // For each local node id, the *unique* set of cross-file paths
  // referenced by edges touching it. Built once here so we don't
  // walk the edge list inside every NodeRenderer.
  const crossFileByNode = new Map<string, Set<string>>();
  for (const edge of positioned.edges) {
    if (edge.toFile !== undefined) {
      const set = crossFileByNode.get(edge.from) ?? new Set<string>();
      set.add(edge.toFile);
      crossFileByNode.set(edge.from, set);
    }
    if (edge.fromFile !== undefined) {
      const set = crossFileByNode.get(edge.to) ?? new Set<string>();
      set.add(edge.fromFile);
      crossFileByNode.set(edge.to, set);
    }
  }

  return (
    <>
      <defs>
        <FilledTriangleMarker id={ARROW_MARKER_FILLED} />
        <OpenTriangleMarker id={ARROW_MARKER_OPEN} />
        <SelectedArrowMarker id={ARROW_MARKER_SELECTED} />
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
            crossFileByNode={crossFileByNode}
            {...(selectedNodeIds !== undefined ? { selectedNodeIds } : {})}
            {...(onSelectNode !== undefined ? { onSelectNode } : {})}
            {...(onOpenSubFile !== undefined ? { onOpenSubFile } : {})}
            {...(onCrossFileNavigate !== undefined
              ? { onCrossFileNavigate }
              : {})}
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
  onOpenSubFile,
  onCrossFileNavigate,
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
          {...(onOpenSubFile !== undefined ? { onOpenSubFile } : {})}
          {...(onCrossFileNavigate !== undefined
            ? { onCrossFileNavigate }
            : {})}
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
