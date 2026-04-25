import type { PositionedNode } from "../layout/types.ts";
import { ServiceNode } from "./nodes/ServiceNode.tsx";
import { DatabaseNode } from "./nodes/DatabaseNode.tsx";
import { QueueNode } from "./nodes/QueueNode.tsx";
import { CacheNode } from "./nodes/CacheNode.tsx";
import { FrontendNode } from "./nodes/FrontendNode.tsx";
import { ExternalNode } from "./nodes/ExternalNode.tsx";
import { FunctionNode } from "./nodes/FunctionNode.tsx";
import { CustomNode } from "./nodes/CustomNode.tsx";

type ShapeProps = { node: PositionedNode };

function Shape({ node }: ShapeProps): React.ReactElement {
  switch (node.kind) {
    case "service":
      return <ServiceNode node={node} />;
    case "database":
      return <DatabaseNode node={node} />;
    case "queue":
      return <QueueNode node={node} />;
    case "cache":
      return <CacheNode node={node} />;
    case "frontend":
      return <FrontendNode node={node} />;
    case "external":
      return <ExternalNode node={node} />;
    case "function":
      return <FunctionNode node={node} />;
    case "custom":
      return <CustomNode node={node} />;
    default: {
      const _exhaustive: never = node.kind;
      void _exhaustive;
      throw new Error(`unreachable node kind`);
    }
  }
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

  return (
    <g
      data-archik-node-id={node.id}
      {...(isSelected ? { "data-archik-selected": "true" } : {})}
      transform={`translate(${node.x}, ${node.y})`}
      {...(handleClick !== undefined ? { onClick: handleClick } : {})}
      style={onSelectNode ? { cursor: "pointer" } : undefined}
    >
      <Shape node={node} />
      {isSelected && (
        <rect
          width={node.width}
          height={node.height}
          rx={10}
          ry={10}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2.5}
          strokeOpacity={0.8}
          pointerEvents="none"
        />
      )}
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
