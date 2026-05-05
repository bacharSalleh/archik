import type { PositionedNode, ViewMode } from "../layout/types.ts";
import { ServiceNode } from "./nodes/ServiceNode.tsx";
import { QueueNode } from "./nodes/QueueNode.tsx";
import { ExternalNode } from "./nodes/ExternalNode.tsx";
import { DatabaseNode } from "./nodes/DatabaseNode.tsx";
import { CloudNode } from "./nodes/CloudNode.tsx";
import { CustomNode } from "./nodes/CustomNode.tsx";
import { CompactNode } from "./nodes/CompactNode.tsx";
import {
  CrossFileIcon,
  InfoIcon,
  NotesIcon,
  SubArchIcon,
  iconAnchorsFor,
  trayCenters,
} from "./icons.tsx";

type ShapeProps = {
  node: PositionedNode;
  selected: boolean;
  viewMode: ViewMode;
  depth: number;
};

function Shape({
  node,
  selected,
  viewMode,
  depth,
}: ShapeProps): React.ReactElement {
  if (viewMode === "compact") {
    return <CompactNode node={node} selected={selected} depth={depth} />;
  }
  // Any node with children is a container — the kind decides the icon
  // and accent color, but the structure has to be container-style or
  // the children render *on top of* the leaf card's body text.
  if (node.children.length > 0) {
    return <CustomNode node={node} selected={selected} depth={depth} />;
  }
  switch (node.kind) {
    case "queue":
      return <QueueNode node={node} selected={selected} />;
    case "external":
    case "human":
      return <ExternalNode node={node} selected={selected} />;
    case "database":
      return <DatabaseNode node={node} selected={selected} />;
    case "cloud":
      return <CloudNode node={node} selected={selected} />;
    // `module` / `custom` without diagram children — render as the
    // standard card with a MODULE / CUSTOM kind tag, same as every
    // other leaf kind. (When they DO have children they're caught
    // by the `node.children.length > 0` branch above and become a
    // proper container with header bar + tinted body.)
    case "module":
    case "custom":
    // Every other leaf kind also renders as the standard card; the
    // kind icon and KIND label inside the header carry the visual
    // identity.
    case "service":
    case "function":
    case "worker":
    case "agent":
    case "cache":
    case "vectordb":
    case "storage":
    case "topic":
    case "stream":
    case "gateway":
    case "cdn":
    case "route":
    case "interface":
    case "adapter":
    case "port":
    case "llm":
    case "prompt":
    case "tool":
    case "auth":
    case "observability":
    case "frontend":
    case "page":
    case "component":
    case "store":
    case "hook":
      return <ServiceNode node={node} selected={selected} />;
    default: {
      const _exhaustive: never = node.kind;
      void _exhaustive;
      throw new Error(`unreachable node kind`);
    }
  }
}


type Props = {
  node: PositionedNode;
  selectedNodeIds?: ReadonlySet<string>;
  glowNodeIds?: ReadonlySet<string>;
  onSelectNode?:
    | ((id: string, event: React.MouseEvent) => void)
    | undefined;
  /** Drill into a node's sub-architecture. Only fired when the node
   *  has `archikFile` and the user clicks the SubArchIcon badge.
   *  Push semantics — adds the target onto the navigation stack. */
  onOpenSubFile?: (archikFile: string, label: string) => void;
  /** Lateral navigation to a peer file referenced by a cross-file
   *  edge (the ↗ badge). Replace semantics — resets the stack to
   *  the target file as the new root. Falls back to onOpenSubFile
   *  when not provided so older callers keep working. */
  onCrossFileNavigate?: (archikFile: string, label: string) => void;
  /** Map of node id → set of cross-file paths the node has edges to.
   *  Used to render one CrossFileIcon badge per unique referenced
   *  file, with click-to-navigate via `onCrossFileNavigate`. */
  crossFileByNode?: ReadonlyMap<string, ReadonlySet<string>>;
  viewMode?: ViewMode;
  /** Container nesting depth — 0 for roots, +1 per container ancestor. */
  depth?: number;
};

export function NodeRenderer({
  node,
  selectedNodeIds,
  glowNodeIds,
  onSelectNode,
  onOpenSubFile,
  onCrossFileNavigate,
  crossFileByNode,
  viewMode = "detailed",
  depth = 0,
}: Props): React.ReactElement {
  const isSelected = selectedNodeIds?.has(node.id) ?? false;
  const isGlowed = glowNodeIds?.has(node.id) ?? false;
  const isContainer = node.children.length > 0;
  const childDepth = isContainer ? depth + 1 : depth;

  const handleClick = onSelectNode
    ? (e: React.MouseEvent<SVGGElement>) => {
        e.stopPropagation();
        onSelectNode(node.id, e);
      }
    : undefined;

  const hasDescription =
    node.description !== undefined && node.description.length > 0;

  return (
    <g
      data-archik-node-id={node.id}
      {...(isSelected ? { "data-archik-selected": "true" } : {})}
      {...(node.status !== undefined && node.status !== "active"
        ? { "data-archik-status": node.status }
        : {})}
      {...(node.stereotype !== undefined
        ? { "data-archik-stereotype": node.stereotype }
        : {})}
      transform={`translate(${node.x}, ${node.y})`}
      {...(handleClick !== undefined ? { onClick: handleClick } : {})}
      style={onSelectNode ? { cursor: "pointer" } : undefined}
    >
      {isGlowed && (
        <rect
          x={-4}
          y={-4}
          width={node.width + 8}
          height={node.height + 8}
          rx={10}
          fill="none"
          stroke="var(--archik-status-proposed)"
          strokeWidth={2}
          opacity={0.85}
          style={{ pointerEvents: "none" }}
        />
      )}
      <Shape node={node} selected={isSelected} viewMode={viewMode} depth={depth} />

      {/* ECB stereotype band — painted after Shape so it isn't buried under the node fill.
          A clipPath matching the node's rx=8 rounded rect makes the band follow the corners
          instead of cutting straight across them. Band starts at y=2 (not 0) so the selection
          stroke at the top edge remains fully visible; robustness mode bumps height to 6px via CSS.
          The badge text floats above the node (y=-9) and is hidden by CSS until robustness mode
          is active, at which point it shows the stereotype label in the matching colour. */}
      {node.stereotype !== undefined && (
        <>
          <clipPath id={`archik-nclip-${node.id}`}>
            <rect width={node.width} height={node.height} rx={8} ry={8} />
          </clipPath>
          <rect
            className="archik-stereotype-band"
            x={0}
            y={2}
            width={node.width}
            height={4}
            clipPath={`url(#archik-nclip-${node.id})`}
            style={{ pointerEvents: "none" }}
          />
          <text
            className="archik-stereotype-badge"
            x={node.width / 2}
            y={-9}
            textAnchor="middle"
            style={{ pointerEvents: "none" }}
          >
            {node.stereotype.toUpperCase()}
          </text>
        </>
      )}
      {viewMode === "detailed" && !isContainer && (() => {
        const hasNotes =
          node.notes !== undefined && node.notes.length > 0;
        const hasArchikFile =
          node.archikFile !== undefined && node.archikFile.length > 0;
        const crossFilePaths = crossFileByNode?.get(node.id);
        const crossFileList: string[] = crossFilePaths
          ? Array.from(crossFilePaths).sort()
          : [];
        type TrayKind = "info" | "notes" | "subarch" | { type: "crossfile"; path: string };
        const trayItems: TrayKind[] = [];
        // Sub-arch first so it's the rightmost — most actionable, easiest to find.
        if (hasArchikFile) trayItems.push("subarch");
        // Then one cross-file icon per unique referenced file.
        for (const p of crossFileList) trayItems.push({ type: "crossfile", path: p });
        if (hasDescription) trayItems.push("info");
        if (hasNotes) trayItems.push("notes");
        if (trayItems.length === 0) return null;
        const anchors = iconAnchorsFor(node.kind, node.width, node.height);
        const slots = trayCenters(anchors.right, trayItems.length);
        return (
          <>
            {trayItems.map((kind, i) => {
              const slot = slots[i]!;
              if (typeof kind === "object" && kind.type === "crossfile") {
                const filePath = kind.path;
                const fileLabel = filePath
                  .split("/")
                  .pop()!
                  .replace(/\.archik\.yaml$/, "");
                // Cross-file navigation = lateral move, not drill-
                // down. Prefer the dedicated callback; fall back to
                // onOpenSubFile only when callers haven't wired the
                // cross-file path explicitly (keeps older embeds
                // working with degraded breadcrumb behaviour).
                const handler = onCrossFileNavigate ?? onOpenSubFile;
                const handleOpen = handler
                  ? (e: React.MouseEvent) => {
                      e.stopPropagation();
                      handler(filePath, fileLabel);
                    }
                  : undefined;
                return (
                  <CrossFileIcon
                    key={`xf-${filePath}`}
                    cx={slot.x}
                    cy={slot.y}
                    filePath={filePath}
                    fileLabel={fileLabel}
                    {...(handleOpen ? { onClick: handleOpen } : {})}
                  />
                );
              }
              if (kind === "subarch") {
                const archikFile = node.archikFile!;
                const handleOpen = onOpenSubFile
                  ? (e: React.MouseEvent) => {
                      e.stopPropagation();
                      onOpenSubFile(archikFile, node.name);
                    }
                  : undefined;
                return (
                  <SubArchIcon
                    key="subarch"
                    cx={slot.x}
                    cy={slot.y}
                    {...(handleOpen ? { onClick: handleOpen } : {})}
                  />
                );
              }
              if (kind === "info") {
                return (
                  <InfoIcon
                    key="info"
                    cx={slot.x}
                    cy={slot.y}
                    color="var(--archik-node-caption)"
                  />
                );
              }
              return (
                <g key="notes">
                  <NotesIcon
                    cx={slot.x}
                    cy={slot.y}
                    color="var(--archik-node-caption)"
                  />
                  {node.notes && node.notes.length > 1 && (
                    <text
                      x={slot.x + 7}
                      y={slot.y - 5}
                      fontSize={8}
                      fontWeight={700}
                      fill="var(--archik-accent)"
                      textAnchor="middle"
                      pointerEvents="none"
                    >
                      {node.notes.length}
                    </text>
                  )}
                </g>
              );
            })}
          </>
        );
      })()}
      {node.children.map((child) => (
        <NodeRenderer
          key={child.id}
          node={child}
          viewMode={viewMode}
          depth={childDepth}
          {...(selectedNodeIds !== undefined ? { selectedNodeIds } : {})}
          {...(glowNodeIds !== undefined ? { glowNodeIds } : {})}
          {...(onSelectNode !== undefined ? { onSelectNode } : {})}
          {...(onOpenSubFile !== undefined ? { onOpenSubFile } : {})}
          {...(onCrossFileNavigate !== undefined ? { onCrossFileNavigate } : {})}
          {...(crossFileByNode !== undefined ? { crossFileByNode } : {})}
        />
      ))}
    </g>
  );
}
