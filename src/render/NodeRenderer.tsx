import type { PositionedNode } from "../layout/types.ts";
import { ServiceNode } from "./nodes/ServiceNode.tsx";
import { DatabaseNode } from "./nodes/DatabaseNode.tsx";
import { QueueNode } from "./nodes/QueueNode.tsx";
import { CacheNode } from "./nodes/CacheNode.tsx";
import { FrontendNode } from "./nodes/FrontendNode.tsx";
import { ExternalNode } from "./nodes/ExternalNode.tsx";
import { FunctionNode } from "./nodes/FunctionNode.tsx";
import { CustomNode } from "./nodes/CustomNode.tsx";

type Props = { node: PositionedNode };

function Shape({ node }: Props): React.ReactElement {
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

export function NodeRenderer({ node }: Props): React.ReactElement {
  return (
    <g
      data-archik-node-id={node.id}
      transform={`translate(${node.x}, ${node.y})`}
    >
      <Shape node={node} />
      {node.children.map((child) => (
        <NodeRenderer key={child.id} node={child} />
      ))}
    </g>
  );
}
