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
      {
        name: "stereotype",
        required: false,
        type: "enum",
        notes:
          'boundary | control | entity — Jacobson ECB classification. When set on both endpoints of a message in a `realizes`-bound seq diagram, the validator enforces the robustness transition rules (boundary→control, control→{boundary|control|entity}, entity→{control|entity}). Adoption is incremental: untagged nodes are skipped.',
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
      "Optional `stereotype: boundary | control | entity` on a node enables Jacobson ECB validation inside `realizes`-bound seq diagrams. Forbidden transitions: boundary→boundary, boundary→entity, entity→boundary. Untagged nodes are skipped (gradual adoption).",
    ],
  };
}

function isJson(opts: ParsedOptions): boolean {
  const v = getString(opts, "json");
  return v !== undefined && v !== "false" && v !== "0";
}

type SeqSchemaSpec = {
  seqDocument: FieldSpec[];
  participant: FieldSpec[];
  message: FieldSpec[];
  note: FieldSpec[];
  group: FieldSpec[];
  arrowTypes: string[];
  notePositions: string[];
  groupKinds: string[];
  constraints: string[];
};

function buildSeqSchema(): SeqSchemaSpec {
  return {
    seqDocument: [
      { name: "version", required: true, type: 'literal "1.0"' },
      { name: "name", required: true, type: "string" },
      { name: "description", required: false, type: "string" },
      {
        name: "realizes",
        required: false,
        type: "Realizes",
        notes:
          "optional binding to a use-case slice — { useCase: <id>, slice: <id> }. When set, validate enforces bidirectional integrity with the .archik.uc.yaml file.",
      },
      { name: "participants", required: true, type: "array of Participant" },
      { name: "steps", required: true, type: "array of Step (message | note | group)" },
    ],
    participant: [
      { name: "id", required: true, type: "string", notes: "kebab-case, unique within document" },
      { name: "nodeId", required: true, type: "string", notes: "must reference an existing architecture node id" },
      { name: "label", required: false, type: "string", notes: "display override; defaults to the node's name" },
    ],
    message: [
      { name: "type", required: true, type: 'literal "message"' },
      { name: "id", required: true, type: "string", notes: "kebab-case, unique" },
      { name: "from", required: true, type: "string", notes: "participant id" },
      { name: "to", required: true, type: "string", notes: "participant id; same as from for self-calls" },
      { name: "label", required: true, type: "string" },
      { name: "arrow", required: true, type: "enum", notes: "see ARROW TYPES" },
      { name: "activate", required: false, type: "boolean", notes: "show activation bar on receiver" },
      { name: "status", required: false, type: "enum", notes: "proposed | active | deprecated" },
    ],
    note: [
      { name: "type", required: true, type: 'literal "note"' },
      { name: "id", required: true, type: "string" },
      { name: "position", required: true, type: "enum", notes: "see NOTE POSITIONS" },
      { name: "participants", required: true, type: "array of string", notes: "participant ids the note spans" },
      { name: "text", required: true, type: "string" },
      { name: "status", required: false, type: "enum", notes: "proposed | active | deprecated" },
    ],
    group: [
      { name: "type", required: true, type: 'literal "group"' },
      { name: "id", required: true, type: "string" },
      { name: "kind", required: true, type: "enum", notes: "see GROUP KINDS" },
      { name: "condition", required: false, type: "string", notes: "displayed after the kind label" },
      { name: "label", required: false, type: "string" },
      { name: "branches", required: false, type: "array of Branch", notes: "for alt/opt/loop/par/break" },
      { name: "seqFile", required: false, type: "string", notes: "for ref groups — path to another .archik.seq.yaml" },
      { name: "participants", required: false, type: "array of string", notes: "for ref groups — which participants are involved" },
      { name: "status", required: false, type: "enum", notes: "proposed | active | deprecated" },
    ],
    arrowTypes: ["sync", "async", "return", "create", "destroy"],
    notePositions: ["over", "left_of", "right_of"],
    groupKinds: ["alt", "opt", "loop", "par", "break", "ref"],
    constraints: [
      "All participant nodeId values must reference existing architecture nodes.",
      "All from/to in messages must reference declared participant ids.",
      "All id values are unique within the document (including nested steps).",
      "Self-calls (from === to) are valid — rendered as a looped arrow.",
      "ref group seqFile path must exist on disk.",
      "File naming: *.archik.seq.yaml — place under .archik/",
      "If `realizes` is set, the named useCase + slice must exist, and that slice's realization.seqFile must point back at THIS file (bidirectional Jacobson-style use-case realization link).",
    ],
  };
}

type UseCaseSchemaSpec = {
  useCaseDocument: FieldSpec[];
  flows: FieldSpec[];
  basicFlow: FieldSpec[];
  alternateFlow: FieldSpec[];
  slice: FieldSpec[];
  realization: FieldSpec[];
  constraints: string[];
};

function buildUseCaseSchema(): UseCaseSchemaSpec {
  return {
    useCaseDocument: [
      { name: "version", required: true, type: 'literal "1.0"' },
      {
        name: "id",
        required: true,
        type: "string",
        notes:
          "kebab-case; the use case id. Seq files reference this via `realizes.useCase`.",
      },
      { name: "name", required: true, type: "string" },
      { name: "description", required: false, type: "string" },
      {
        name: "status",
        required: false,
        type: "enum",
        notes: "proposed | active | deprecated",
      },
      {
        name: "primaryActor",
        required: true,
        type: "string",
        notes: "actor id; must resolve in some *.archik.actors.yaml file",
      },
      {
        name: "secondaryActors",
        required: false,
        type: "array of string",
        notes: "actor ids; each must resolve",
      },
      {
        name: "goal",
        required: true,
        type: "string",
        notes: "one sentence: what value the actor walks away with",
      },
      { name: "preconditions", required: false, type: "array of string" },
      { name: "postconditions", required: false, type: "array of string" },
      { name: "flows", required: true, type: "Flows" },
      { name: "slices", required: true, type: "array of Slice (≥1)" },
    ],
    flows: [
      { name: "basic", required: true, type: "BasicFlow" },
      {
        name: "alternates",
        required: false,
        type: "array of AlternateFlow",
        notes: "each branches off the basic (or another) flow at a step number",
      },
    ],
    basicFlow: [
      {
        name: "steps",
        required: true,
        type: "array of string (≥1)",
        notes: "imperative sentences from the actor's POV (\"Customer submits cart\")",
      },
    ],
    alternateFlow: [
      { name: "id", required: true, type: "string", notes: "kebab-case; can't be 'basic'" },
      {
        name: "branchFrom",
        required: true,
        type: "string",
        notes: "<flowId>.<stepNumber> — e.g. basic.3 — must reference a real step",
      },
      { name: "steps", required: true, type: "array of string (≥1)" },
    ],
    slice: [
      { name: "id", required: true, type: "string", notes: "kebab-case, unique within the use case" },
      { name: "description", required: true, type: "string", notes: "one sentence on what the slice covers" },
      {
        name: "flows",
        required: true,
        type: "array of string (≥1)",
        notes:
          "must include 'basic'; alternate ids are appended for slices covering branches",
      },
      {
        name: "tests",
        required: false,
        type: "array of string",
        notes:
          "test paths (relative to project root); REQUIRED for active slices; each must exist on disk",
      },
      {
        name: "realization",
        required: false,
        type: "Realization",
        notes:
          "binds this slice to a sequence diagram (the Jacobson use-case realization)",
      },
      {
        name: "status",
        required: false,
        type: "enum",
        notes: "proposed | active | deprecated",
      },
    ],
    realization: [
      {
        name: "seqFile",
        required: true,
        type: "string",
        notes:
          "relative path to a *.archik.seq.yaml file; must exist; the seq file's `realizes` block must point back at this slice",
      },
    ],
    constraints: [
      "File naming: *.archik.uc.yaml — one file per use case under .archik/usecases/",
      "Every active slice MUST declare ≥1 test path; each test path MUST exist on disk.",
      "primaryActor + secondaryActors MUST resolve in the actor index built from *.archik.actors.yaml.",
      "Every slice MUST include the `basic` flow (alternates branch off basic; a slice without basic has no prefix).",
      "alternate.branchFrom MUST reference a real <flowId>.<stepNumber> within the same use case.",
      "Slice realization.seqFile (when set) MUST point at a discovered seq file; that seq file's `realizes` MUST point back here (bidirectional).",
      "Use case ids are unique across all *.archik.uc.yaml files.",
    ],
  };
}

type ActorSchemaSpec = {
  actorDocument: FieldSpec[];
  actor: FieldSpec[];
  actorKinds: string[];
  constraints: string[];
};

function buildActorSchema(): ActorSchemaSpec {
  return {
    actorDocument: [
      { name: "version", required: true, type: 'literal "1.0"' },
      { name: "description", required: false, type: "string" },
      { name: "actors", required: true, type: "array of Actor (≥1)" },
    ],
    actor: [
      { name: "id", required: true, type: "string", notes: "kebab-case, unique across all actor files" },
      { name: "kind", required: true, type: "enum", notes: "see ACTOR KINDS" },
      { name: "description", required: true, type: "string", notes: "explain who/what the actor is" },
      {
        name: "goals",
        required: false,
        type: "array of string",
        notes: "free-form goal labels; future milestone may bind to use case ids",
      },
      {
        name: "status",
        required: false,
        type: "enum",
        notes: "proposed | active | deprecated",
      },
    ],
    actorKinds: ["human", "external-system", "time", "device"],
    constraints: [
      "File naming: *.archik.actors.yaml — anywhere under .archik/",
      "Actor ids are unique across all *.archik.actors.yaml files in the project.",
      "Use case primaryActor + secondaryActors MUST reference a defined actor id.",
    ],
  };
}

function formatUseCaseSchema(spec: UseCaseSchemaSpec): string {
  const sections: string[] = [];
  sections.push("USE CASE DOCUMENT  (*.archik.uc.yaml)");
  for (const f of spec.useCaseDocument) sections.push(formatField(f));
  sections.push("");
  sections.push("FLOWS");
  for (const f of spec.flows) sections.push(formatField(f));
  sections.push("");
  sections.push("BASIC FLOW");
  for (const f of spec.basicFlow) sections.push(formatField(f));
  sections.push("");
  sections.push("ALTERNATE FLOW");
  for (const f of spec.alternateFlow) sections.push(formatField(f));
  sections.push("");
  sections.push("SLICE");
  for (const f of spec.slice) sections.push(formatField(f));
  sections.push("");
  sections.push("REALIZATION  (slice.realization)");
  for (const f of spec.realization) sections.push(formatField(f));
  sections.push("");
  sections.push("CONSTRAINTS");
  for (const c of spec.constraints) sections.push(`  • ${c}`);
  sections.push("");
  return sections.join("\n");
}

function formatActorSchema(spec: ActorSchemaSpec): string {
  const sections: string[] = [];
  sections.push("ACTOR DOCUMENT  (*.archik.actors.yaml)");
  for (const f of spec.actorDocument) sections.push(formatField(f));
  sections.push("");
  sections.push("ACTOR");
  for (const f of spec.actor) sections.push(formatField(f));
  sections.push("");
  sections.push("ACTOR KINDS");
  sections.push("  " + spec.actorKinds.join(", "));
  sections.push("");
  sections.push("CONSTRAINTS");
  for (const c of spec.constraints) sections.push(`  • ${c}`);
  sections.push("");
  return sections.join("\n");
}

function useCaseSchemaCommand(opts: ParsedOptions): number {
  const spec = buildUseCaseSchema();
  if (isJson(opts)) {
    console.log(JSON.stringify(spec, null, 2));
    return 0;
  }
  console.log(formatUseCaseSchema(spec));
  return 0;
}

function actorSchemaCommand(opts: ParsedOptions): number {
  const spec = buildActorSchema();
  if (isJson(opts)) {
    console.log(JSON.stringify(spec, null, 2));
    return 0;
  }
  console.log(formatActorSchema(spec));
  return 0;
}

function formatSeqSchema(spec: SeqSchemaSpec): string {
  const sections: string[] = [];
  sections.push("SEQ DOCUMENT");
  for (const f of spec.seqDocument) sections.push(formatField(f));
  sections.push("");
  sections.push("PARTICIPANT");
  for (const f of spec.participant) sections.push(formatField(f));
  sections.push("");
  sections.push("MESSAGE  (step type: message)");
  for (const f of spec.message) sections.push(formatField(f));
  sections.push("");
  sections.push("NOTE  (step type: note)");
  for (const f of spec.note) sections.push(formatField(f));
  sections.push("");
  sections.push("GROUP  (step type: group)");
  for (const f of spec.group) sections.push(formatField(f));
  sections.push("");
  sections.push("ARROW TYPES  (message.arrow)");
  sections.push("  " + spec.arrowTypes.join(", "));
  sections.push("");
  sections.push("NOTE POSITIONS  (note.position)");
  sections.push("  " + spec.notePositions.join(", "));
  sections.push("");
  sections.push("GROUP KINDS  (group.kind)");
  sections.push("  " + spec.groupKinds.join(", "));
  sections.push("");
  sections.push("CONSTRAINTS");
  for (const c of spec.constraints) sections.push(`  • ${c}`);
  sections.push("");
  return sections.join("\n");
}

function seqSchemaCommand(opts: ParsedOptions): number {
  const spec = buildSeqSchema();
  if (isJson(opts)) {
    console.log(JSON.stringify(spec, null, 2));
    return 0;
  }
  console.log(formatSeqSchema(spec));
  return 0;
}

export function schemaCommand(opts: ParsedOptions): number {
  if (opts._[0] === "seq") return seqSchemaCommand(opts);
  if (opts._[0] === "uc" || opts._[0] === "usecase") {
    return useCaseSchemaCommand(opts);
  }
  if (opts._[0] === "actors" || opts._[0] === "actor") {
    return actorSchemaCommand(opts);
  }
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
