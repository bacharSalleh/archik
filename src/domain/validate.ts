import type { ZodError } from "zod";
import { DocumentSchema } from "./schema.ts";
import type { Document } from "./types.ts";

export type ValidationError = {
  path: string;
  message: string;
};

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
