import type { PositionedNode, ViewMode } from "../layout/types.ts";
import { ServiceNode } from "./nodes/ServiceNode.tsx";
import { QueueNode } from "./nodes/QueueNode.tsx";
import { ExternalNode } from "./nodes/ExternalNode.tsx";
import { CustomNode } from "./nodes/CustomNode.tsx";
import { CompactNode } from "./nodes/CompactNode.tsx";
import { InfoIcon, NotesIcon, iconAnchorsFor, trayCenters } from "./icons.tsx";

type ShapeProps = {
  node: PositionedNode;
  selected: boolean;
  viewMode: ViewMode;
};

function Shape({
  node,
  selected,
  viewMode,
}: ShapeProps): React.ReactElement {
  if (viewMode === "compact") {
    return <CompactNode node={node} selected={selected} />;
  }
  switch (node.kind) {
    case "queue":
      return <QueueNode node={node} selected={selected} />;
    case "external":
      return <ExternalNode node={node} selected={selected} />;
    case "module":
    case "custom":
      return <CustomNode node={node} selected={selected} />;
    // Every other kind renders as the standard card; the kind icon
    // and KIND label inside the header carry the visual identity.
    case "service":
    case "function":
    case "worker":
    case "agent":
    case "database":
    case "cache":
    case "vectordb":
    case "storage":
    case "topic":
    case "stream":
    case "gateway":
    case "cdn":
    case "interface":
    case "adapter":
    case "port":
    case "llm":
    case "prompt":
    case "tool":
    case "auth":
    case "observability":
    case "cloud":
    case "frontend":
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
  onSelectNode?:
    | ((id: string, event: React.MouseEvent) => void)
    | undefined;
  viewMode?: ViewMode;
};

export function NodeRenderer({
  node,
  selectedNodeIds,
  onSelectNode,
  viewMode = "detailed",
}: Props): React.ReactElement {
  const isSelected = selectedNodeIds?.has(node.id) ?? false;

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
      transform={`translate(${node.x}, ${node.y})`}
      {...(handleClick !== undefined ? { onClick: handleClick } : {})}
      style={onSelectNode ? { cursor: "pointer" } : undefined}
    >
      <Shape node={node} selected={isSelected} viewMode={viewMode} />
      {viewMode === "detailed" && node.kind !== "custom" && node.kind !== "module" && (() => {
        const hasNotes =
          node.notes !== undefined && node.notes.length > 0;
        const trayItems: Array<"info" | "notes"> = [];
        if (hasDescription) trayItems.push("info");
        if (hasNotes) trayItems.push("notes");
        if (trayItems.length === 0) return null;
        const anchors = iconAnchorsFor(node.kind, node.width, node.height);
        const slots = trayCenters(anchors.right, trayItems.length);
        return (
          <>
            {trayItems.map((kind, i) => {
              const slot = slots[i]!;
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
          {...(selectedNodeIds !== undefined ? { selectedNodeIds } : {})}
          {...(onSelectNode !== undefined ? { onSelectNode } : {})}
        />
      ))}
    </g>
  );
}
