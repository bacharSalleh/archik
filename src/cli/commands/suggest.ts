import { existsSync } from "node:fs";
import { access, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  archikFileMode,
  isSuggestion,
  stripSuggestionMarker,
  suggestionPath,
} from "../../domain/suggestion.ts";
import { diffDocuments } from "../../domain/diff.ts";
import {
  checkCrossFileReferences,
  checkSourcePaths,
  formatErrors,
  validateDocument,
} from "../../domain/validate.ts";
import { parseYaml, stringifyYaml } from "../../io/yaml.ts";
import type { Document } from "../../domain/types.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { projectRoot, resolveDocPath } from "../resolveDocPath.ts";

type Sub = "show" | "accept" | "reject" | "set";

const isJson = (opts: ParsedOptions): boolean => {
  const v = getString(opts, "json");
  return v !== undefined && v !== "false" && v !== "0";
};

export async function suggestCommand(opts: ParsedOptions): Promise<number> {
  const sub = (opts._[0] as Sub | undefined) ?? "show";
  if (sub !== "show" && sub !== "accept" && sub !== "reject" && sub !== "set") {
    console.error(
      `✗ Unknown subcommand "${sub}". Use show / set / accept / reject.`,
    );
    return 1;
  }

  // `set` takes a draft path as its second positional, NOT an archik
  // doc path — resolve the main file via the default resolver (or
  // --main override) instead.
  if (sub === "set") {
    return set(opts);
  }

  let mainPath: string;
  try {
    mainPath = await resolveDocPath(opts._[1] as string | undefined);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const sidecar = suggestionPath(mainPath);

  if (sub === "show") return show(mainPath, sidecar, isJson(opts));
  if (sub === "accept") return accept(mainPath, sidecar);
  return reject(sidecar);
}

async function show(
  mainPath: string,
  sidecar: string,
  json: boolean,
): Promise<number> {
  if (!(await exists(sidecar))) {
    if (json) {
      console.log(
        JSON.stringify({ ok: true, pending: false, sidecar: path.basename(sidecar) }),
      );
    } else {
      console.log(
        `No pending suggestion (${path.basename(sidecar)} not present).`,
      );
    }
    return 0;
  }
  const sidecarText = await readFile(sidecar, "utf-8");
  let sidecarDoc;
  try {
    sidecarDoc = parseYaml(sidecarText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      console.log(
        JSON.stringify({ ok: false, sidecar: path.basename(sidecar), error: message }),
      );
    } else {
      console.error(`✗ Suggestion file fails validation:`);
      console.error(message);
    }
    return 1;
  }

  const suggestionMeta = sidecarDoc.metadata?.suggestion;
  const mainExists = await exists(mainPath);
  let totals = { added: 0, removed: 0, changed: 0 };
  let diff = null as ReturnType<typeof diffDocuments> | null;
  if (mainExists) {
    const mainDoc = parseYaml(await readFile(mainPath, "utf-8"));
    diff = diffDocuments(mainDoc, sidecarDoc);
    totals = {
      added: diff.nodes.added.length + diff.edges.added.length,
      removed: diff.nodes.removed.length + diff.edges.removed.length,
      changed: diff.nodes.changed.length + diff.edges.changed.length,
    };
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          pending: true,
          sidecar: path.basename(sidecar),
          main: path.basename(mainPath),
          mainExists,
          suggestion: suggestionMeta ?? null,
          totals,
          diff,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log(`Suggestion: ${path.basename(sidecar)}`);
  if (suggestionMeta) {
    console.log(`  authored:  ${suggestionMeta.at}`);
    console.log(`  proposes:  changes to ${suggestionMeta.from}`);
    if (suggestionMeta.note) console.log(`  note:      ${suggestionMeta.note}`);
  }
  console.log("");
  if (!mainExists) {
    console.log(
      "(no current architecture file — accept will install this as the new one)",
    );
    return 0;
  }
  if (totals.added + totals.removed + totals.changed === 0) {
    console.log("Suggestion is identical to the current file.");
    return 0;
  }
  console.log(
    `Diff vs current: ${totals.added} added, ${totals.removed} removed, ${totals.changed} changed`,
  );
  console.log("");
  console.log("To preview visually:");
  console.log(
    `  archik diff ${path.basename(mainPath)} ${path.basename(sidecar)} --out diff.svg`,
  );
  console.log("");
  console.log("To apply or discard:");
  console.log("  archik suggest accept");
  console.log("  archik suggest reject");
  return 0;
}

async function accept(mainPath: string, sidecar: string): Promise<number> {
  if (!(await exists(sidecar))) {
    console.error(`✗ No suggestion to accept (${path.basename(sidecar)} not present).`);
    return 1;
  }
  let doc;
  try {
    doc = parseYaml(await readFile(sidecar, "utf-8"));
  } catch (err) {
    console.error(`✗ Suggestion file fails validation; refusing to accept.`);
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
  // Strip the suggestion marker — once accepted, this is the new
  // canonical architecture, not a draft.
  const cleaned = stripSuggestionMarker(doc);
  await writeFile(mainPath, stringifyYaml(cleaned), "utf-8");
  await unlink(sidecar);
  const wasMarked = isSuggestion(doc);
  console.log(`✓ Accepted${wasMarked ? "" : " (no suggestion marker found, applied as-is)"} → ${path.basename(mainPath)}`);
  return 0;
}

async function reject(sidecar: string): Promise<number> {
  if (!(await exists(sidecar))) {
    console.log(`Nothing to reject (${path.basename(sidecar)} not present).`);
    return 0;
  }
  await unlink(sidecar);
  console.log(`✓ Rejected — deleted ${path.basename(sidecar)}`);
  return 0;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * `archik suggest set <draft>` — promote a Claude-authored draft into
 * the canonical sidecar position. The CLI is the only sanctioned way
 * to write `.archik/main.archik.suggested.yaml`; the slash commands
 * call this verb so Claude never touches archik files with the
 * Write/Edit tools directly.
 *
 * Steps:
 *   1. Read the draft from `<draft>` (or stdin when path is "-").
 *   2. Parse + schema-validate.
 *   3. Resolve cross-file references against the same project root
 *      the dev server / validate command uses.
 *   4. Stamp `metadata.suggestion` with `{from, at, note?}` (overwriting
 *      any pre-existing block — the CLI is authoritative for these
 *      fields).
 *   5. Atomically rename into the sidecar path next to the main file.
 *
 * Refuses to write the draft directly over the main file — that's the
 * exact "manual edit" we're trying to prevent.
 */
async function set(opts: ParsedOptions): Promise<number> {
  const json = isJson(opts);
  const draftArg = opts._[1] as string | undefined;
  if (draftArg === undefined || draftArg === "") {
    return fail(json, "Missing draft path. Usage: archik suggest set <path|-> [--note '...']");
  }

  let mainPath: string;
  try {
    mainPath = await resolveDocPath(getString(opts, "main"));
  } catch (err) {
    return fail(json, err instanceof Error ? err.message : String(err));
  }
  const sidecar = suggestionPath(mainPath);

  // Forbid writing the draft over the main file. The whole point of
  // the sidecar workflow is that the main file is owned by the user.
  const draftAbs =
    draftArg === "-" ? null : path.resolve(process.cwd(), draftArg);
  if (draftAbs !== null && draftAbs === mainPath) {
    return fail(
      json,
      `Refusing to use the main file as a draft (${path.relative(process.cwd(), mainPath) || mainPath}). Write the draft elsewhere.`,
    );
  }

  // Orphan-sidecar guardrail: a `set` against a main that doesn't yet
  // exist on disk produces a `<x>.archik.suggested.yaml` with no
  // sibling `<x>.archik.yaml`, which the canvas can't render alongside
  // the rest of the diagram (no `archikFile:` pointer to it from a
  // file the canvas already shows). Agents hit this when they try to
  // propose a brand-new sub-architecture in one shot. Force the
  // explicit `--allow-orphan` opt-in so the workflow is intentional;
  // the canvas surfaces orphan sidecars distinctly so the user knows
  // they're pending.
  const allowOrphan = getString(opts, "allow-orphan") === "true";
  if (!allowOrphan && !(await exists(mainPath))) {
    return fail(
      json,
      `Main file ${path.relative(process.cwd(), mainPath) || mainPath} does not exist. ` +
        `If you intend to propose a new sub-architecture, pass --allow-orphan; ` +
        `otherwise propose the change to the parent file (with archikFile: ...) first.`,
    );
  }

  let text: string;
  try {
    text = draftArg === "-" ? await readStdin() : await readFile(draftAbs!, "utf-8");
  } catch (err) {
    return fail(json, `Cannot read draft: ${err instanceof Error ? err.message : String(err)}`);
  }

  let parsed: Document;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    return fail(json, err instanceof Error ? err.message : String(err));
  }

  // Full schema validation — without this, the draft can carry
  // structural violations (parent↔child edges, duplicate ids, parent
  // cycles, edges to unknown nodes) that the dev server then writes
  // straight to disk. parseYaml's own check catches type errors but
  // not the document-level superRefine rules.
  const validated = validateDocument(parsed);
  if (!validated.ok) {
    if (json) {
      console.error(
        JSON.stringify({ ok: false, errors: validated.errors }, null, 2),
      );
    } else {
      console.error(`✗ Draft fails schema validation:`);
      console.error(formatErrors(validated.errors));
    }
    return 1;
  }
  const doc = validated.value;

  // Cross-file existence — same rule as `archik validate`. A draft
  // that references a missing peer file would render as a 404 in the
  // canvas, so catch it here.
  const root = projectRoot(mainPath);
  const fileExists = (rel: string): boolean =>
    existsSync(path.resolve(root, rel));
  const crossErrors = checkCrossFileReferences(doc, fileExists);
  if (crossErrors.length > 0) {
    if (json) {
      console.error(
        JSON.stringify({ ok: false, errors: crossErrors }, null, 2),
      );
    } else {
      console.error(`✗ Draft references missing files:`);
      console.error(formatErrors(crossErrors));
    }
    return 1;
  }

  // sourcePath rules. The sidecar will become the new main file on
  // accept, so we apply the *target file*'s mode to the draft — i.e.,
  // a suggestion proposing changes to a `*.archik.discussion.yaml`
  // gets the relaxed rules; a suggestion to a normal file is strict.
  const targetMode = archikFileMode(mainPath);
  const sourcePathErrors = checkSourcePaths(doc, targetMode, fileExists);
  if (sourcePathErrors.length > 0) {
    if (json) {
      console.error(
        JSON.stringify({ ok: false, errors: sourcePathErrors }, null, 2),
      );
    } else {
      console.error(`✗ Draft fails sourcePath validation:`);
      console.error(formatErrors(sourcePathErrors));
    }
    return 1;
  }

  // Stamp the suggestion marker. The CLI owns `from` and `at` — we
  // overwrite whatever the draft had so they're always accurate.
  // `note` comes from --note if given, otherwise we keep what the
  // draft already had (Claude may have authored a sensible one),
  // otherwise it's omitted.
  const noteFlag = getString(opts, "note");
  const existingNote = doc.metadata?.suggestion?.note;
  const note = noteFlag !== undefined ? noteFlag : existingNote;
  const fromRel =
    path.relative(process.cwd(), mainPath) || path.basename(mainPath);
  const stamped: Document = {
    ...doc,
    metadata: {
      ...(doc.metadata ?? {}),
      suggestion: {
        from: fromRel,
        at: new Date().toISOString(),
        ...(note !== undefined ? { note } : {}),
      },
    },
  };

  // Atomic write: stage to <sidecar>.tmp then rename. Avoids leaving a
  // half-written sidecar in place if the process is killed mid-write,
  // which would confuse `suggest show` and the canvas.
  const tmp = `${sidecar}.tmp`;
  try {
    await writeFile(tmp, stringifyYaml(stamped), "utf-8");
    await rename(tmp, sidecar);
  } catch (err) {
    return fail(json, `Cannot write sidecar: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          sidecar: path.relative(process.cwd(), sidecar) || sidecar,
          main: fromRel,
          note: note ?? null,
          nodes: stamped.nodes.length,
          edges: stamped.edges.length,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `✓ Suggestion staged → ${path.relative(process.cwd(), sidecar) || sidecar}`,
    );
    console.log(
      `  ${stamped.nodes.length} nodes, ${stamped.edges.length} edges${note ? ` — ${note}` : ""}`,
    );
    console.log("");
    console.log("Review:  archik suggest show");
    console.log("Apply:   archik suggest accept");
    console.log("Discard: archik suggest reject");
  }
  return 0;
}

function fail(json: boolean, message: string): number {
  if (json) console.error(JSON.stringify({ ok: false, error: message }));
  else console.error(`✗ ${message}`);
  return 1;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}
