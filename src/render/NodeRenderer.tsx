import type { PositionedNode } from "../layout/types.ts";
import { ServiceNode } from "./nodes/ServiceNode.tsx";
import { DatabaseNode } from "./nodes/DatabaseNode.tsx";
import { GenericNode } from "./nodes/GenericNode.tsx";

type Props = { node: PositionedNode };

function Shape({ node }: Props): React.ReactElement {
  switch (node.kind) {
    case "service":
      return <ServiceNode node={node} />;
    case "database":
      return <DatabaseNode node={node} />;
    default:
      return <GenericNode node={node} />;
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
