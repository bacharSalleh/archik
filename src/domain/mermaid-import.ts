/**
 * Mermaid flowchart → archik importer, for teams migrating existing
 * diagrams. Parses the common flowchart/graph subset:
 *
 *   flowchart TD                    (or graph LR / TB / RL / BT)
 *   api[Orders API] --> db[(Postgres)]
 *   api -->|emits| queue
 *   a --> b --> c                   (chains)
 *   subgraph billing [Billing]      (→ module node, children parented)
 *     charge --> ledger
 *   end
 *
 * Kind heuristics are shape-first (`[(…)]` cylinder → database,
 * `((…))` circle → external), then label keywords (db/database,
 * queue, cache, gateway). Everything else imports as `custom` —
 * non-code-bearing, so the result validates without sourcePaths;
 * reclassifying nodes onto real code is the follow-up step.
 *
 * Out of scope (skipped with a warning, never a hard failure):
 * classDefs, click/style lines, `&` fan-outs, sequence/class/state
 * diagrams.
 */
import type { Document, Edge, Node } from "./types.ts";
import type { NodeKind } from "./taxonomy.ts";

export type MermaidIssue = { line: number; message: string };

export type MermaidImportResult = {
  doc: Document;
  issues: MermaidIssue[];
};

const HEADER = /^\s*(?:flowchart|graph)\s+(?:TD|TB|BT|LR|RL)\s*$/i;
const SUBGRAPH = /^\s*subgraph\s+([A-Za-z][\w-]*)\s*(?:\[([^\]]*)\])?\s*$/;
const END = /^\s*end\s*$/;
const SKIPPABLE = /^\s*(?:%%|classDef\b|class\b|style\b|click\b|linkStyle\b|direction\b)/;

/** One node token: id + optional shaped label. Shapes we recognise:
 *  [text] (text) ((text)) [(text)] {text} >text] */
const NODE_TOKEN =
  /([A-Za-z][\w-]*)\s*(\[\(.*?\)\]|\(\(.*?\)\)|\[.*?\]|\(.*?\)|\{.*?\}|>.*?\])?/;

/** Arrow between two node tokens: `-->` `--->` `==>` `-.->` `---`,
 *  with mermaid's optional trailing `|label|`. */
const ARROW = /\s*(?:-{2,}>|={2,}>|-\.+->|---)\s*(?:\|([^|]*)\|)?\s*/;

function toId(raw: string): string {
  let id = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!/^[a-z]/.test(id)) id = `n-${id}`;
  return id;
}

function labelOf(shaped: string | undefined, fallback: string): string {
  if (shaped === undefined) return fallback;
  const inner = shaped
    .replace(/^\[\(|\)\]$/g, "")
    .replace(/^\(\(|\)\)$/g, "")
    .replace(/^[[({>]|[\])}]$/g, "")
    .replace(/^"|"$/g, "")
    .trim();
  return inner === "" ? fallback : inner;
}

function kindOf(shaped: string | undefined, label: string): NodeKind {
  if (shaped !== undefined) {
    if (shaped.startsWith("[(")) return "database";
    if (shaped.startsWith("((")) return "external";
  }
  const lower = label.toLowerCase();
  if (/\b(db|database|postgres|mysql|mongo)\b/.test(lower)) return "database";
  if (/\bqueue\b/.test(lower)) return "queue";
  if (/\bcache\b|redis/.test(lower)) return "cache";
  if (/\bgateway\b/.test(lower)) return "gateway";
  return "custom";
}

export function importMermaid(
  source: string,
  projectName: string,
): MermaidImportResult {
  const issues: MermaidIssue[] = [];
  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];
  const seenEdges = new Set<string>();
  const subgraphStack: string[] = [];

  // Pull the diagram out of a fenced markdown block when present.
  let text = source;
  const fence = /```\s*mermaid\s*\n([\s\S]*?)```/m.exec(source);
  if (fence !== null) text = fence[1]!;

  const ensureNode = (
    rawId: string,
    shaped: string | undefined,
  ): string => {
    const id = toId(rawId);
    const existing = nodes.get(id);
    if (existing !== undefined) {
      // A later shaped occurrence may refine a bare reference.
      if (shaped !== undefined && existing.name === rawId) {
        existing.name = labelOf(shaped, rawId);
        existing.kind = kindOf(shaped, existing.name);
      }
      return id;
    }
    const name = labelOf(shaped, rawId);
    const node: Node = {
      id,
      kind: kindOf(shaped, name),
      name,
      description: `Imported from Mermaid node "${rawId}". Refine this description with what the component actually does.`,
    };
    const parent = subgraphStack[subgraphStack.length - 1];
    if (parent !== undefined && parent !== id) node.parentId = parent;
    nodes.set(id, node);
    return id;
  };

  const lines = text.split("\n");
  let sawHeader = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const lineNo = i + 1;
    if (line === "" || SKIPPABLE.test(line)) continue;
    if (HEADER.test(line)) {
      sawHeader = true;
      continue;
    }
    // Refuse to guess at other diagram types (sequenceDiagram,
    // classDiagram, …) — without a flowchart header, bare tokens
    // would silently become bogus nodes.
    if (!sawHeader) {
      issues.push({
        line: lineNo,
        message:
          "expected a `flowchart <dir>` / `graph <dir>` header before content — only flowchart diagrams are supported",
      });
      break;
    }
    const sub = SUBGRAPH.exec(line);
    if (sub !== null) {
      const id = toId(sub[1]!);
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          kind: "module",
          name: sub[2]?.trim() || sub[1]!,
          description: `Imported from Mermaid subgraph "${sub[1]}".`,
          ...(subgraphStack.length > 0
            ? { parentId: subgraphStack[subgraphStack.length - 1]! }
            : {}),
        });
      }
      subgraphStack.push(id);
      continue;
    }
    if (END.test(line)) {
      if (subgraphStack.length > 0) subgraphStack.pop();
      continue;
    }
    if (line.includes("&")) {
      issues.push({ line: lineNo, message: "`&` fan-out syntax is not supported — line skipped" });
      continue;
    }

    // Edge chains: token (arrow token)+ — or a standalone node def.
    const chain = new RegExp(
      `^${NODE_TOKEN.source}(?:(${ARROW.source})${NODE_TOKEN.source})*$`,
    );
    if (!chain.test(line)) {
      issues.push({ line: lineNo, message: `unrecognised line skipped: "${line.slice(0, 60)}"` });
      continue;
    }

    // Walk the chain left to right.
    const tokenAndArrow = new RegExp(
      `${NODE_TOKEN.source}\\s*(?:(${ARROW.source})|$)`,
      "g",
    );
    let prev: string | undefined;
    let prevLabel: string | undefined;
    let match;
    while ((match = tokenAndArrow.exec(line)) !== null) {
      if (match[0] === "") break; // zero-width guard
      const id = ensureNode(match[1]!, match[2]);
      if (prev !== undefined && prev !== id) {
        const edgeId = `${prev}-to-${id}`;
        if (!seenEdges.has(edgeId)) {
          seenEdges.add(edgeId);
          const edge: Edge = {
            id: edgeId,
            from: prev,
            to: id,
            relationship: "depends_on",
          };
          if (prevLabel !== undefined && prevLabel.trim() !== "") {
            edge.label = prevLabel.trim();
          }
          edges.push(edge);
        }
      }
      prev = id;
      prevLabel = match[4]; // |label| group inside the arrow
      if (match[3] === undefined) break; // no arrow → chain ends
    }
  }

  if (!sawHeader && nodes.size === 0) {
    issues.push({
      line: 0,
      message: "no flowchart/graph header and no nodes found — is this a flowchart diagram?",
    });
  }

  // Parent-chain edges are rejected by the schema (the subgraph
  // already contains the child) — drop them with a note.
  const parentOf = new Map([...nodes.values()].map((n) => [n.id, n.parentId]));
  const isAncestor = (anc: string, desc: string): boolean => {
    let cursor = parentOf.get(desc);
    let steps = 0;
    while (cursor !== undefined && steps <= nodes.size) {
      if (cursor === anc) return true;
      cursor = parentOf.get(cursor);
      steps++;
    }
    return false;
  };
  const keptEdges = edges.filter((e) => {
    if (isAncestor(e.from, e.to) || isAncestor(e.to, e.from)) {
      issues.push({
        line: 0,
        message: `edge ${e.from} → ${e.to} connects a subgraph with its own member — dropped (containment already expresses it)`,
      });
      return false;
    }
    return true;
  });

  return {
    doc: {
      version: "1.0",
      name: projectName,
      nodes: [...nodes.values()],
      edges: keptEdges,
    },
    issues,
  };
}
