/**
 * `archik schema` — print the document schema in an agent-friendly
 * format, so callers (Claude, Cursor, scripts) get the *exact*
 * shape from the CLI rather than a prose description that drifts
 * from the Zod source.
 *
 * Two output modes:
 *   - default: human/agent-readable text (one section per shape)
 *   - --json:  structured `{ document, node, edge, kinds, relationships }`
 *
 * Why this exists: when an agent has to author a YAML draft and the
 * skill describes the schema in prose, the agent fills in the
 * details from intuition and gets things wrong on the first try
 * (`notes: "..."` instead of `notes: ["..."]`, missing edge `id`,
 * etc.). Pointing them at this command means one source of truth
 * and zero memory tax.
 */
import { NODE_KINDS } from "../../domain/taxonomy.ts";
import { RELATIONSHIPS } from "../../domain/relationships.ts";
import { getString, type ParsedOptions } from "../options.ts";

type FieldSpec = {
  name: string;
  required: boolean;
  type: string;
  notes?: string;
};

type SchemaSpec = {
  document: FieldSpec[];
  node: FieldSpec[];
  edge: FieldSpec[];
  interface: FieldSpec[];
  metadata: FieldSpec[];
  suggestionMetadata: FieldSpec[];
  kinds: ReadonlyArray<string>;
  relationships: ReadonlyArray<string>;
  constraints: string[];
};

/**
 * Hand-curated against `src/domain/schema.ts`. Two reasons we don't
 * autogenerate from the Zod schema:
 *   1. Field-level "notes" (e.g. "kebab-case", "must reference an
 *      existing node id", "NOT a single string") are richer than
 *      Zod's introspection exposes without writing a custom walker.
 *   2. The output is the contract — agents will memoise it. Hand
 *      writing keeps it stable when the Zod surface refactors
 *      internally.
 *
 * If you change the Zod schema, update this function. The schema
 * round-trip test in `domain/schema.test.ts` plus the new tests in
 * `schema.test.ts` keep us honest.
 */
function buildSchema(): SchemaSpec {
  return {
    document: [
      { name: "version", required: true, type: 'literal "1.0"' },
      { name: "name", required: true, type: "string" },
      { name: "description", required: false, type: "string" },
      { name: "nodes", required: true, type: "array of Node" },
      { name: "edges", required: true, type: "array of Edge" },
      { name: "metadata", required: false, type: "DocumentMetadata" },
    ],
    node: [
      {
        name: "id",
        required: true,
        type: "string",
        notes: "kebab-case, ^[a-z][a-z0-9-]*$, unique within document",
      },
      {
        name: "kind",
        required: true,
        type: "enum",
        notes: "see KINDS below",
      },
      { name: "name", required: true, type: "string" },
      {
        name: "description",
        required: true,
        type: "string",
        notes:
          "REQUIRED — explain what the node does (its responsibility / behaviour), not just what kind it is. Empty strings rejected.",
      },
      { name: "stack", required: false, type: "string" },
      {
        name: "responsibilities",
        required: false,
        type: "array of string",
        notes: "ARRAY, never a single string",
      },
      {
        name: "interfaces",
        required: false,
        type: "array of Interface",
        notes: "see Interface below",
      },
      {
        name: "notes",
        required: false,
        type: "array of string",
        notes: "ARRAY, never a single string",
      },
      {
        name: "parentId",
        required: false,
        type: "string",
        notes: "must reference an existing node.id; no parentId cycles",
      },
      {
        name: "archikFile",
        required: false,
        type: "string",
        notes:
          "relative path under .archik/, ends in .archik.yaml, resolved from project root",
      },
      {
        name: "sourcePath",
        required: false,
        type: "string",
        notes:
          "relative path to source code on disk. REQUIRED in normal/suggested files for code-bearing kinds (service, function, worker, module, page, component, store, hook); MUST exist on disk. Optional in *.archik.discussion.yaml files. Used by `archik drift`.",
      },
      {
        name: "status",
        required: false,
        type: "enum",
        notes:
          'proposed | active | deprecated — drift only checks active nodes (default when absent)',
      },
      { name: "metadata", required: false, type: "object" },
    ],
    edge: [
      {
        name: "id",
        required: true,
        type: "string",
        notes: "REQUIRED, kebab-case, unique within document",
      },
      {
        name: "from",
        required: true,
        type: "string",
        notes:
          "must reference an existing node.id (unless fromFile is set)",
      },
      {
        name: "to",
        required: true,
        type: "string",
        notes:
          "must reference an existing node.id (unless toFile is set)",
      },
      {
        name: "relationship",
        required: true,
        type: "enum",
        notes: "see RELATIONSHIPS below",
      },
      { name: "label", required: false, type: "string" },
      { name: "description", required: false, type: "string" },
      { name: "protocol", required: false, type: "string" },
      {
        name: "color",
        required: false,
        type: "string",
        notes: "any CSS color (hex, named, var())",
      },
      {
        name: "status",
        required: false,
        type: "enum",
        notes:
          'proposed | active | deprecated — same enum as Node. Default (absent) is active. The renderer dashes + colours non-active edges with the same status palette as nodes.',
      },
      {
        name: "fromFile",
        required: false,
        type: "string",
        notes: "relative path; cross-file edge — see archikFile rules",
      },
      {
        name: "toFile",
        required: false,
        type: "string",
        notes: "relative path; cross-file edge — see archikFile rules",
      },
    ],
    interface: [
      { name: "name", required: true, type: "string" },
      { name: "protocol", required: true, type: "string" },
      { name: "description", required: false, type: "string" },
    ],
    metadata: [
      { name: "createdAt", required: false, type: "string" },
      { name: "updatedAt", required: false, type: "string" },
      {
        name: "suggestion",
        required: false,
        type: "SuggestionMetadata",
        notes: "stamped by `archik suggest set`; do not author by hand",
      },
    ],
    suggestionMetadata: [
      {
        name: "from",
        required: true,
        type: "string",
        notes: "the file this suggestion proposes to change",
      },
      { name: "at", required: true, type: "string", notes: "ISO timestamp" },
      { name: "note", required: false, type: "string" },
    ],
    kinds: NODE_KINDS,
    relationships: RELATIONSHIPS,
    constraints: [
      "Every node.id and edge.id is unique within the document.",
      "Edges reference existing node ids (unless fromFile/toFile are set).",
      "No self-loop edges (from === to).",
      "No edges between a node and any of its parent-chain ancestors — the parent already CONTAINS the child visually, so an edge between them is a duplicate.",
      "No duplicate edges by (from, to, relationship) — silent dupes render as overlapping strokes; remove one.",
      "When a parent and a code-bearing child both declare sourcePath and the parent's path is a directory, the child's sourcePath MUST be inside the parent's. Catches diagram structure that contradicts the source layout.",
      "parentId references an existing node, with no cycles.",
      "Coordinates (x, y, width, height, viewport) are REJECTED — layout is computed by ELK.",
      "Empty arrays are allowed; empty strings on required fields are not.",
      "Cross-file paths (archikFile, fromFile, toFile) end in .archik.yaml, no `..`, forward slashes only, resolved from project root.",
      "File modes (by filename suffix): *.archik.yaml = normal; *.archik.suggested.yaml = pending suggestion (no separate \"discussion\" mode — use status: proposed on individual nodes/edges for greenfield work).",
      "Every code-bearing node (service/function/worker/module/page/component/store/hook) MUST declare sourcePath, and that path MUST exist on disk — UNLESS the node has status proposed or deprecated (those are explicitly \"code may not exist\" lifecycle states).",
      "Every node MUST have a non-empty `description` explaining what it does. Empty / omitted descriptions are rejected.",
      "Edges may carry a `status` field with the same enum (proposed / active / deprecated). The renderer applies the same dashed + coloured-border treatment used for node status.",
    ],
  };
}

function isJson(opts: ParsedOptions): boolean {
  const v = getString(opts, "json");
  return v !== undefined && v !== "false" && v !== "0";
}

export function schemaCommand(opts: ParsedOptions): number {
  const spec = buildSchema();
  if (isJson(opts)) {
    console.log(JSON.stringify(spec, null, 2));
    return 0;
  }
  console.log(formatHuman(spec));
  return 0;
}

function formatField(f: FieldSpec): string {
  const flag = f.required ? "required" : "optional";
  const head = `  ${f.name.padEnd(18)} ${flag.padEnd(9)} ${f.type}`;
  return f.notes ? `${head}\n  ${" ".repeat(28)}— ${f.notes}` : head;
}

function formatHuman(spec: SchemaSpec): string {
  const sections: string[] = [];

  sections.push("DOCUMENT");
  for (const f of spec.document) sections.push(formatField(f));

  sections.push("");
  sections.push("NODE");
  for (const f of spec.node) sections.push(formatField(f));

  sections.push("");
  sections.push("EDGE");
  for (const f of spec.edge) sections.push(formatField(f));

  sections.push("");
  sections.push("INTERFACE  (used inside Node.interfaces)");
  for (const f of spec.interface) sections.push(formatField(f));

  sections.push("");
  sections.push("METADATA  (Document.metadata)");
  for (const f of spec.metadata) sections.push(formatField(f));

  sections.push("");
  sections.push("SUGGESTION METADATA  (Document.metadata.suggestion)");
  for (const f of spec.suggestionMetadata) sections.push(formatField(f));

  sections.push("");
  sections.push(`KINDS  (Node.kind, ${spec.kinds.length} values)`);
  sections.push("  " + spec.kinds.join(", "));

  sections.push("");
  sections.push(
    `RELATIONSHIPS  (Edge.relationship, ${spec.relationships.length} values)`,
  );
  sections.push("  " + spec.relationships.join(", "));

  sections.push("");
  sections.push("CONSTRAINTS");
  for (const c of spec.constraints) sections.push(`  • ${c}`);

  sections.push("");
  sections.push(
    `Author drafts via \`npx archik suggest set\`; the CLI validates`,
  );
  sections.push(`against the live Zod schema and reports field-level errors.`);
  sections.push("");

  return sections.join("\n");
}
