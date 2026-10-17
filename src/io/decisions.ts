/**
 * Writes the decision record for an accepted sidecar. Shared by
 * `archik suggest accept` and the canvas accept endpoint, so every
 * accept path leaves the same record behind.
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DECISIONS_DIR,
  formatDecisionRecord,
  nextRecordNumber,
  recordFileName,
  type Decision,
} from "../domain/decision.ts";
import type { Document } from "../domain/types.ts";

export const MISSING_DECISION_MESSAGE =
  "Suggestion has no decision record. Add metadata.suggestion.decision " +
  "(context, decision, alternatives, consequences) to the draft and re-stage it " +
  "with `archik suggest set`.";

/** The decision a sidecar carries, or null. */
export function sidecarDecision(doc: Document): Decision | null {
  return doc.metadata?.suggestion?.decision ?? null;
}

/** Project root for any model file — the folder above `.archik/`. */
export function rootForModelFile(modelPath: string): string {
  const abs = path.resolve(modelPath);
  const marker = `${path.sep}.archik${path.sep}`;
  const i = abs.lastIndexOf(marker);
  return i >= 0 ? abs.slice(0, i) : path.dirname(abs);
}

/** Record title: the sidecar note, else the first sentence of the decision. */
function titleFor(doc: Document, decision: Decision): string {
  const note = doc.metadata?.suggestion?.note?.trim();
  if (note) return note;
  const first = decision.decision.split(/(?<=[.!?])\s/)[0]!.trim();
  return first.length > 80 ? `${first.slice(0, 77)}...` : first;
}

const EMPTY: Document = { version: "1.0", name: "", nodes: [], edges: [] };

/**
 * Write `.archik/decisions/NNNN-<slug>.md` for an accepted sidecar.
 * `before` is the main file as it was (null when accept creates it).
 * Returns the project-relative path of the record.
 */
export async function writeDecisionRecord(input: {
  mainPath: string;
  sidecarDoc: Document;
  before: Document | null;
  after: Document;
  now?: Date;
}): Promise<string> {
  const decision = sidecarDecision(input.sidecarDoc);
  if (decision === null) throw new Error(MISSING_DECISION_MESSAGE);
  const root = rootForModelFile(input.mainPath);
  const dir = path.join(root, DECISIONS_DIR);
  await mkdir(dir, { recursive: true });
  const title = titleFor(input.sidecarDoc, decision);
  const toRel = (p: string): string => path.relative(root, p).split(path.sep).join("/");
  const text = (n: number): string =>
    formatDecisionRecord({
      number: n,
      title,
      date: (input.now ?? new Date()).toISOString().slice(0, 10),
      modelFile: toRel(input.mainPath),
      decision,
      before: input.before ?? EMPTY,
      after: input.after,
    });
  // `wx` fails if the name is taken (a concurrent accept), so retry
  // with the next number instead of overwriting a record.
  for (let attempt = 0; attempt < 5; attempt++) {
    const n = nextRecordNumber(await readdir(dir));
    const file = path.join(dir, recordFileName(n, title));
    try {
      await writeFile(file, text(n), { encoding: "utf-8", flag: "wx" });
      return toRel(file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
  throw new Error("Could not pick a free decision record number.");
}
