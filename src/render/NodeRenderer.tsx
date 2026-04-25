import type { PositionedNode } from "../layout/types.ts";
import { ServiceNode } from "./nodes/ServiceNode.tsx";
import { DatabaseNode } from "./nodes/DatabaseNode.tsx";
import { QueueNode } from "./nodes/QueueNode.tsx";
import { CacheNode } from "./nodes/CacheNode.tsx";
import { FrontendNode } from "./nodes/FrontendNode.tsx";
import { ExternalNode } from "./nodes/ExternalNode.tsx";
import { FunctionNode } from "./nodes/FunctionNode.tsx";
import { CustomNode } from "./nodes/CustomNode.tsx";

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

function DescriptionIndicator({
  width,
  hasStack,
}: {
  width: number;
  hasStack: boolean;
}): React.ReactElement {
  void hasStack;
  return (
    <g
      transform={`translate(${width - 14}, 8)`}
      pointerEvents="none"
      aria-hidden="true"
    >
      <circle
        r={6}
        fill="var(--archik-panel)"
        stroke="var(--archik-node-caption)"
        strokeWidth={1}
      />
      <text
        textAnchor="middle"
        y={3.5}
        fontSize={9}
        fontWeight={700}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fill="var(--archik-node-caption)"
      >
        i
      </text>
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
      {hasDescription && node.kind !== "external" && (
        <DescriptionIndicator
          width={node.width}
          hasStack={node.stack !== undefined}
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
