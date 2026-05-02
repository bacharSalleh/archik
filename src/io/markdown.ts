import type { Document, Edge, Node } from "../domain/types.ts";

function nodeSection(node: Node): string {
  const lines: string[] = [];
  lines.push(`### ${node.name} (${node.kind})`);
  if (node.id !== undefined) lines.push(`- **id**: \`${node.id}\``);
  if (node.status && node.status !== "active") {
    lines.push(`- **status**: ${node.status}`);
  }
  if (node.stack !== undefined) lines.push(`- **stack**: ${node.stack}`);
  if (node.description !== undefined) {
    lines.push(`- **description**: ${node.description}`);
  }
  if (node.parentId !== undefined) {
    lines.push(`- **parent**: \`${node.parentId}\``);
  }
  if (node.responsibilities && node.responsibilities.length > 0) {
    lines.push(`- **responsibilities**:`);
    for (const r of node.responsibilities) lines.push(`  - ${r}`);
  }
  if (node.interfaces && node.interfaces.length > 0) {
    lines.push(`- **interfaces**:`);
    for (const i of node.interfaces) {
      const desc = i.description !== undefined ? ` — ${i.description}` : "";
      lines.push(`  - \`${i.name}\` (${i.protocol})${desc}`);
    }
  }
  const notes = node.notes?.filter((n) => n.trim().length > 0) ?? [];
  if (notes.length > 0) {
    lines.push(`- **notes**:`);
    for (const note of notes) lines.push(`  - ${note}`);
  }
  return lines.join("\n");
}

function edgeLine(edge: Edge, byId: Map<string, Node>): string {
  const from = byId.get(edge.from)?.name ?? edge.from;
  const to = byId.get(edge.to)?.name ?? edge.to;
  const label = edge.label !== undefined ? `: ${edge.label}` : "";
  return `- ${from} **${edge.relationship}** ${to}${label}`;
}

export function exportMarkdown(doc: Document): string {
  const byId = new Map<string, Node>();
  for (const n of doc.nodes) byId.set(n.id, n);

  const parts: string[] = [];
  parts.push(`# ${doc.name}`);
  if (doc.description !== undefined) parts.push("", doc.description);

  parts.push("", "## Components");
  if (doc.nodes.length === 0) {
    parts.push("", "_No components yet._");
  } else {
    for (const n of doc.nodes) parts.push("", nodeSection(n));
  }

  parts.push("", "## Connections");
  if (doc.edges.length === 0) {
    parts.push("", "_No connections yet._");
  } else {
    parts.push("");
    for (const e of doc.edges) parts.push(edgeLine(e, byId));
  }

  return `${parts.join("\n")}\n`;
}
