import type { PositionedNode } from "../layout/types.ts";
import { ServiceNode } from "./nodes/ServiceNode.tsx";
import { DatabaseNode } from "./nodes/DatabaseNode.tsx";
import { QueueNode } from "./nodes/QueueNode.tsx";
import { CacheNode } from "./nodes/CacheNode.tsx";
import { FrontendNode } from "./nodes/FrontendNode.tsx";
import { ExternalNode } from "./nodes/ExternalNode.tsx";
import { FunctionNode } from "./nodes/FunctionNode.tsx";
import { CustomNode } from "./nodes/CustomNode.tsx";
import { KIND_META } from "./kindPalette.ts";
import { InfoIcon, iconAnchorsFor } from "./icons.tsx";

type ShapeProps = { node: PositionedNode; selected: boolean };

function Shape({ node, selected }: ShapeProps): React.ReactElement {
  switch (node.kind) {
    case "service":
      return <ServiceNode node={node} selected={selected} />;
    case "database":
      return <DatabaseNode node={node} selected={selected} />;
    case "queue":
      return <QueueNode node={node} selected={selected} />;
    case "cache":
      return <CacheNode node={node} selected={selected} />;
    case "frontend":
      return <FrontendNode node={node} selected={selected} />;
    case "external":
      return <ExternalNode node={node} selected={selected} />;
    case "function":
      return <FunctionNode node={node} selected={selected} />;
    case "custom":
      return <CustomNode node={node} selected={selected} />;
    default: {
      const _exhaustive: never = node.kind;
      void _exhaustive;
      throw new Error(`unreachable node kind`);
    }
  }
}

function KindTag({
  cx,
  cy,
  kind,
}: {
  cx: number;
  cy: number;
  kind: PositionedNode["kind"];
}): React.ReactElement {
  const color = KIND_META[kind].color;
  return (
    <g
      transform={`translate(${cx}, ${cy})`}
      pointerEvents="none"
      aria-hidden="true"
    >
      <circle r={3.5} fill={color} />
      <circle
        r={3.5}
        fill="none"
        stroke={color}
        strokeOpacity={0.4}
        strokeWidth={2}
      />
    </g>
  );
}

type Props = {
  node: PositionedNode;
  selectedNodeId?: string | undefined;
  onSelectNode?: ((id: string) => void) | undefined;
};

export function NodeRenderer({
  node,
  selectedNodeId,
  onSelectNode,
}: Props): React.ReactElement {
  const isSelected = selectedNodeId === node.id;

  const handleClick = onSelectNode
    ? (e: React.MouseEvent<SVGGElement>) => {
        e.stopPropagation();
        onSelectNode(node.id);
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
      <Shape node={node} selected={isSelected} />
      {(() => {
        if (node.kind === "custom") return null;
        const anchors = iconAnchorsFor(node.kind, node.width, node.height);
        return (
          <>
            <KindTag
              cx={anchors.left.x}
              cy={anchors.left.y}
              kind={node.kind}
            />
            {hasDescription && (
              <InfoIcon
                cx={anchors.right.x}
                cy={anchors.right.y}
                color="var(--archik-node-caption)"
              />
            )}
          </>
        );
      })()}
      {node.children.map((child) => (
        <NodeRenderer
          key={child.id}
          node={child}
          {...(selectedNodeId !== undefined ? { selectedNodeId } : {})}
          {...(onSelectNode !== undefined ? { onSelectNode } : {})}
        />
      ))}
    </g>
  );
}
