import type { ZodError } from "zod";
import { DocumentSchema } from "./schema.ts";
import type { Document } from "./types.ts";

export type ValidationError = {
  path: string;
  message: string;
};

export type ValidateResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ValidationError[] };

function pathOf(parts: ReadonlyArray<PropertyKey>): string {
  return parts.length === 0 ? "<root>" : parts.map(String).join(".");
}

function toErrors(zerr: ZodError): ValidationError[] {
  return zerr.issues.flatMap((issue) => {
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => ({
        path: pathOf([...issue.path, key]),
        message: `unrecognized key`,
      }));
    }
    return [{ path: pathOf(issue.path), message: issue.message }];
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
