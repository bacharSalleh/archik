import type { ZodError } from "zod";
import { DocumentSchema } from "./schema.ts";
import { isCodeBearing } from "./taxonomy.ts";
import type { ArchikFileMode } from "./suggestion.ts";
import type { Document } from "./types.ts";

export type ValidationError = {
  path: string;
  message: string;
};

/**
 * Per-mode sourcePath rules.
 *
 *   - normal / suggested: every code-bearing node MUST declare a
 *     non-empty `sourcePath`, and that path MUST exist on disk.
 *     Suggested files use the same rules because they'll become
 *     normal on accept.
 *   - discussion: `sourcePath` is optional. If present, it doesn't
 *     have to exist (greenfield drafts may reference paths that
 *     haven't been created yet). The schema-level format checks
 *     (no `..`, forward slashes, etc.) still apply.
 *
 * `status: proposed` and `status: deprecated` nodes are exempt
 * from the requirement at any mode — `proposed` means the code
 * doesn't exist yet, `deprecated` means it's being phased out and
 * may already be gone. Drift detection skips both for the same
 * reason. If such a node DOES declare a `sourcePath`, it still has
 * to resolve on disk in normal/suggested mode — a stale path on a
 * proposed node would mislead the diagram quietly.
 *
 * The `exists` callback is the same shape used by
 * `checkCrossFileReferences` so the caller can wire one resolver
 * for both checks. Returns one error per offending node.
 */
export function checkSourcePaths(
  doc: Document,
  mode: ArchikFileMode,
  exists: (relPath: string) => boolean,
): ValidationError[] {
  if (mode === "discussion") return [];
  const errors: ValidationError[] = [];
  doc.nodes.forEach((node, i) => {
    if (!isCodeBearing(node.kind)) return;
    const isPlanned = node.status === "proposed" || node.status === "deprecated";
    if (node.sourcePath === undefined || node.sourcePath.length === 0) {
      // Proposed / deprecated nodes don't have to declare a path —
      // they're explicitly the "no file expected" lifecycle states.
      // Active (default) nodes do.
      if (isPlanned) return;
      errors.push({
        path: `nodes.${i}.sourcePath`,
        message:
          `node "${node.id}" (kind: ${node.kind}) is missing required \`sourcePath\`. ` +
          `Code-bearing kinds must declare where their source lives. ` +
          `Either add a sourcePath, mark the node \`status: proposed\` if the code isn't built yet, ` +
          `or move this node into a *.archik.discussion.yaml file for greenfield drafts.`,
      });
      return;
    }
    if (!exists(node.sourcePath)) {
      // Even on a proposed node, a path that's been declared still
      // has to resolve — otherwise typos / refactor-stragglers slip
      // through silently.
      errors.push({
        path: `nodes.${i}.sourcePath`,
        message:
          `node "${node.id}" sourcePath "${node.sourcePath}" does not exist on disk ` +
          `(resolved relative to the project root). Either fix the path, drop it ` +
          `(if status is proposed/deprecated, sourcePath is optional), or move ` +
          `this node into a *.archik.discussion.yaml file.`,
      });
    }
  });
  return errors;
}

/**
 * Walks every cross-file reference (`archikFile` on a node, `fromFile`
 * / `toFile` on an edge) and reports the ones whose target the caller
 * can't find. Pure — the existence check is delegated so this stays
 * testable without touching the disk. The caller must resolve `relPath`
 * against the same project root the dev server uses (the parent of
 * `.archik/` for the new layout, the doc's own directory for the
 * legacy root layout) — otherwise validate green-lights paths the
 * canvas will 404 on.
 */
export function checkCrossFileReferences(
  doc: Document,
  exists: (relPath: string) => boolean,
): ValidationError[] {
  const errors: ValidationError[] = [];
  doc.nodes.forEach((node, i) => {
    if (node.archikFile === undefined) return;
    if (!exists(node.archikFile)) {
      errors.push({
        path: `nodes.${i}.archikFile`,
        message: `archikFile "${node.archikFile}" does not exist (resolved relative to the project root)`,
      });
    }
  });
  doc.edges.forEach((edge, i) => {
    if (edge.fromFile !== undefined && !exists(edge.fromFile)) {
      errors.push({
        path: `edges.${i}.fromFile`,
        message: `fromFile "${edge.fromFile}" does not exist (resolved relative to the project root)`,
      });
    }
    if (edge.toFile !== undefined && !exists(edge.toFile)) {
      errors.push({
        path: `edges.${i}.toFile`,
        message: `toFile "${edge.toFile}" does not exist (resolved relative to the project root)`,
      });
    }
  });
  return errors;
}

export type ValidateResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ValidationError[] };

function pathOf(parts: ReadonlyArray<PropertyKey>): string {
  return parts.length === 0 ? "<root>" : parts.map(String).join(".");
}

/**
 * Hints layered on top of Zod's bare error message for shapes
 * agents repeatedly get wrong on first attempt. The hints are
 * additive (the original Zod message is preserved); they're a
 * teaching moment rather than a translation.
 *
 * If you add hints here, also reflect the same advice in
 * `archik schema` so the proactive read and the reactive validate
 * agree.
 */
function hintFor(
  path: ReadonlyArray<PropertyKey>,
  message: string,
): string | null {
  const last = path[path.length - 1];
  const expectsArray =
    /expected array/i.test(message) && /received\s+string/i.test(message);
  const missingRequired =
    /received\s+undefined/i.test(message) ||
    /required/i.test(message);

  if (
    expectsArray &&
    (last === "notes" ||
      last === "responsibilities" ||
      last === "interfaces")
  ) {
    return `${String(last)} is an array — wrap your value, e.g. ${String(last)}: ['first', 'second']. Run \`npx archik schema\` for the full shape.`;
  }
  // edges.<n>.id missing → very common Claude mistake.
  if (
    missingRequired &&
    last === "id" &&
    path.length >= 2 &&
    path[path.length - 3] === "edges"
  ) {
    return `every edge requires an \`id\` (kebab-case, unique within the document), e.g. id: api-writes-db. Run \`npx archik schema\` for the full Edge shape.`;
  }
  return null;
}

function toErrors(zerr: ZodError): ValidationError[] {
  return zerr.issues.flatMap((issue) => {
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => ({
        path: pathOf([...issue.path, key]),
        message: `unrecognized key`,
      }));
    }
    const hint = hintFor(issue.path, issue.message);
    const message =
      hint === null ? issue.message : `${issue.message}\n    hint: ${hint}`;
    return [{ path: pathOf(issue.path), message }];
  });
}

export function validateDocument(input: unknown): ValidateResult<Document> {
  const result = DocumentSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, errors: toErrors(result.error) };
}

export function formatErrors(errors: ValidationError[]): string {
  return errors.map((e) => `  • ${e.path}: ${e.message}`).join("\n");
}
