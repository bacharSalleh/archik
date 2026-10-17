/**
 * Decision records — the "why" behind every accepted sidecar.
 *
 * The diagram says WHAT the structure is; a decision record says WHY
 * it was chosen, in the short ADR shape (context, decision,
 * alternatives, consequences). The draft carries it under
 * `metadata.suggestion.decision`; `suggest set` refuses a draft
 * without one, and accepting the sidecar writes it to
 * `.archik/decisions/NNNN-<slug>.md`.
 *
 * Records are never edited after they are written. A later decision
 * that changes course lists the old numbers in `supersedes`.
 *
 * Pure: no I/O. The writer lives in src/io/decisions.ts.
 */
import { z } from "zod";
import { diffDocuments } from "./diff.ts";
import { classifyChange } from "./door.ts";
import type { Document } from "./types.ts";

const Text = z.string().trim().min(1);

export const DecisionSchema = z.strictObject({
  /** The problem and the forces at play — why a choice was needed. */
  context: Text,
  /** What was chosen. */
  decision: Text,
  /** Options considered and not chosen (at least one). */
  alternatives: z.array(Text).min(1),
  /** What becomes easier or harder because of this choice. */
  consequences: Text,
  /** How the change is secured, observed and undone. Required by
   *  `suggest set` when the change adds data, an outside system or
   *  public traffic (see door.ts). */
  crossCutting: z
    .strictObject({
      security: Text,
      observability: Text,
      rollback: Text,
    })
    .optional(),
  /** Earlier record numbers this one replaces, e.g. ["0003"]. */
  supersedes: z
    .array(z.string().regex(/^\d{4}$/, "supersedes entries are 4-digit record numbers, e.g. 0003"))
    .min(1)
    .optional(),
});

export type Decision = z.infer<typeof DecisionSchema>;

/** Folder (relative to the project root) that holds the records. */
export const DECISIONS_DIR = ".archik/decisions";

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");
  return slug.length > 0 ? slug : "decision";
}

export function recordFileName(n: number, title: string): string {
  return `${String(n).padStart(4, "0")}-${slugify(title)}.md`;
}

/** Next number after the highest `NNNN-*.md` already present. */
export function nextRecordNumber(existing: readonly string[]): number {
  let max = 0;
  for (const name of existing) {
    const m = /^(\d{4})-.*\.md$/.exec(name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** `name` for complex fields, `parentId: a → b` for simple ones. */
function fieldChange(f: { field: string; before: unknown; after: unknown }): string {
  const simple = (v: unknown): boolean => v === undefined || typeof v === "string" || typeof v === "number";
  if (!simple(f.before) || !simple(f.after)) return f.field;
  const show = (v: unknown): string => (v === undefined ? "none" : String(v));
  const text = `${f.field}: ${show(f.before)} → ${show(f.after)}`;
  return text.length > 120 ? f.field : text;
}

/** One line per structural change — the record's evidence. */
export function modelChangeLines(before: Document, after: Document): { summary: string; lines: string[] } {
  const d = diffDocuments(before, after);
  const lines = [
    ...d.nodes.added.map((n) => `- added node \`${n.id}\` (${n.kind})`),
    ...d.nodes.removed.map((n) => `- removed node \`${n.id}\` (${n.kind})`),
    ...d.nodes.changed.map(
      (c) => `- changed node \`${c.node.id}\`: ${c.changes.map(fieldChange).join(", ")}`,
    ),
    ...d.edges.added.map((e) => `- added edge \`${e.from} → ${e.to}\` (${e.relationship})`),
    ...d.edges.removed.map((e) => `- removed edge \`${e.from} → ${e.to}\` (${e.relationship})`),
    ...d.edges.changed.map(
      (c) =>
        `- changed edge \`${c.edge.from} → ${c.edge.to}\`: ${c.changes.map(fieldChange).join(", ")}`,
    ),
  ];
  const parts = [
    [d.nodes.added.length, "node", "added"],
    [d.nodes.removed.length, "node", "removed"],
    [d.nodes.changed.length, "node", "changed"],
    [d.edges.added.length, "edge", "added"],
    [d.edges.removed.length, "edge", "removed"],
    [d.edges.changed.length, "edge", "changed"],
  ] as const;
  const summary = parts
    .filter(([n]) => n > 0)
    .map(([n, word, verb]) => `${plural(n, word)} ${verb}`)
    .join(", ");
  return { summary: summary.length > 0 ? summary : "no node or edge changes", lines };
}

export function formatDecisionRecord(input: {
  number: number;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** Project-relative path of the model file that changed. */
  modelFile: string;
  decision: Decision;
  before: Document;
  after: Document;
}): string {
  const { decision: d } = input;
  const num = String(input.number).padStart(4, "0");
  const change = modelChangeLines(input.before, input.after);
  const door = classifyChange(input.before, input.after);
  const meta = [
    "- Status: Accepted",
    `- Date: ${input.date}`,
    door.oneWay
      ? `- Reversibility: one-way door (${door.reasons.map((r) => r.text).join("; ")})`
      : "- Reversibility: two-way door",
    ...(d.supersedes ? [`- Supersedes: ${d.supersedes.join(", ")}`] : []),
  ];
  return [
    `# ${num}. ${input.title}`,
    "",
    ...meta,
    "",
    "## Context",
    "",
    d.context,
    "",
    "## Decision",
    "",
    d.decision,
    "",
    "## Alternatives considered",
    "",
    ...d.alternatives.map((a) => `- ${a}`),
    "",
    "## Consequences",
    "",
    d.consequences,
    "",
    ...(d.crossCutting
      ? [
          "## Cross-cutting concerns",
          "",
          `- Security: ${d.crossCutting.security}`,
          `- Observability: ${d.crossCutting.observability}`,
          `- Rollback: ${d.crossCutting.rollback}`,
          "",
        ]
      : []),
    "## Evidence",
    "",
    `Model change (\`${input.modelFile}\`): ${change.summary}`,
    ...(change.lines.length > 0 ? ["", ...change.lines] : []),
    "",
  ].join("\n");
}
