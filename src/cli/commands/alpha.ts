/**
 * `archik alpha` — Essence/SEMAT alpha state tracker.
 *
 * Subcommands:
 *   show                              — render every alpha's claimed
 *                                       state with a verification badge
 *                                       (✓ verified | ✗ over-claimed | ?
 *                                       subjective). --json for CI.
 *   promote <alpha> <state> [--note]  — set the alpha to <state>; runs
 *                                       the machine check first. Subjective
 *                                       states succeed without a check.
 *   demote <alpha> <state>            — set the alpha to <state>; no check.
 *                                       Must be < current.
 *
 * The file ($PROJECT/.archik/alphas.archik.alphas.yaml by convention)
 * is created on first promote/demote if absent.
 */
import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { discoverDocs, type LoadedDoc } from "../../io/discovery.ts";
import { discoverActorDocs } from "../../io/actor-discovery.ts";
import { discoverAlphaDoc } from "../../io/alpha-discovery.ts";
import { discoverSeqDocs } from "../../io/seq-discovery.ts";
import { discoverUseCaseDocs } from "../../io/usecase-discovery.ts";
import {
  ALPHA_NAMES,
  AlphaDocumentSchema,
  STATE_LADDERS,
  stateIndex,
  type AlphaDocument,
  type AlphaName,
} from "../../domain/alpha-schema.ts";
import {
  evaluateAlphaState,
  type AlphaCheckContext,
} from "../../domain/alpha-checks.ts";
import { bold, cross, cyan, dim, gray, tick, yellow } from "../colors.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { projectRoot, resolveDocPath } from "../resolveDocPath.ts";

const isJson = (opts: ParsedOptions): boolean => {
  const v = getString(opts, "json");
  return v !== undefined && v !== "false" && v !== "0";
};

function isAlphaName(s: string): s is AlphaName {
  return (ALPHA_NAMES as ReadonlyArray<string>).includes(s);
}

async function buildContext(root: string, archAbs: string): Promise<{
  ctx: AlphaCheckContext;
  archDocs: LoadedDoc[];
} | { error: string }> {
  const archDiscovery = await discoverDocs(archAbs, root);
  const rootError = archDiscovery.errors.find((e) => e.abs === archAbs);
  if (rootError !== undefined) {
    return { error: `${rootError.relPath}: ${rootError.message}` };
  }
  const ucDiscovery = await discoverUseCaseDocs(root);
  const seqDiscovery = await discoverSeqDocs(root);
  const actorDiscovery = await discoverActorDocs(root);
  const fileExists = (rel: string): boolean =>
    existsSync(path.resolve(root, rel));
  return {
    ctx: {
      archDocs: archDiscovery.docs,
      ucDocs: ucDiscovery.docs,
      seqDocs: seqDiscovery.docs,
      actorDocs: actorDiscovery.docs,
      fileExists,
    },
    archDocs: archDiscovery.docs,
  };
}

function defaultAlphaFilePath(root: string): string {
  return path.join(root, ".archik", "alphas.archik.alphas.yaml");
}

async function writeAlphaDoc(
  abs: string,
  doc: AlphaDocument,
): Promise<void> {
  await mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}`;
  const text = YAML.stringify(doc);
  await writeFile(tmp, text, "utf-8");
  await rename(tmp, abs);
}

type AlphaShowRow = {
  alpha: AlphaName;
  state: string | null;
  ladderIndex: number;
  ladderLength: number;
  verification: "verified" | "over-claimed" | "subjective" | "missing";
  reason?: string;
  note?: string | undefined;
  evidence?: string[] | undefined;
};

function buildShowRows(
  alphasDoc: AlphaDocument | null,
  ctx: AlphaCheckContext,
): AlphaShowRow[] {
  const rows: AlphaShowRow[] = [];
  for (const alpha of ALPHA_NAMES) {
    const entry = alphasDoc?.alphas[alpha];
    if (entry === undefined) {
      rows.push({
        alpha,
        state: null,
        ladderIndex: -1,
        ladderLength: STATE_LADDERS[alpha].length,
        verification: "missing",
      });
      continue;
    }
    const result = evaluateAlphaState(alpha, entry.state, ctx);
    let verification: AlphaShowRow["verification"];
    let reason: string | undefined;
    if (result === null) {
      verification = "subjective";
    } else if (result.ok) {
      verification = "verified";
    } else {
      verification = "over-claimed";
      reason = result.reason;
    }
    rows.push({
      alpha,
      state: entry.state,
      ladderIndex: stateIndex(alpha, entry.state),
      ladderLength: STATE_LADDERS[alpha].length,
      verification,
      ...(reason ? { reason } : {}),
      ...(entry.note ? { note: entry.note } : {}),
      ...(entry.evidence ? { evidence: entry.evidence } : {}),
    });
  }
  return rows;
}

function fmtVerification(v: AlphaShowRow["verification"]): string {
  if (v === "verified") return tick();
  if (v === "over-claimed") return cross();
  if (v === "subjective") return yellow("?");
  return dim("·");
}

function printShowText(rows: AlphaShowRow[], filePath: string | null): void {
  if (filePath !== null) {
    console.log(dim(filePath));
  } else {
    console.log(
      dim(
        "(no alphas file yet; use `archik alpha promote <alpha> <state>` to create one)",
      ),
    );
  }
  for (const row of rows) {
    const label = bold(row.alpha.padEnd(16));
    if (row.state === null) {
      console.log(`  ${dim("·")}  ${label}  ${dim("(unset)")}`);
      continue;
    }
    const badge = fmtVerification(row.verification);
    const ladder = `${row.ladderIndex + 1}/${row.ladderLength}`;
    console.log(`  ${badge}  ${label}  ${cyan(row.state)}  ${gray(ladder)}`);
    if (row.note) console.log(`        ${dim("note:")} ${row.note}`);
    if (row.evidence) {
      for (const e of row.evidence) {
        console.log(`        ${dim("· " + e)}`);
      }
    }
    if (row.verification === "over-claimed" && row.reason) {
      console.log(`        ${cross()} ${row.reason}`);
    }
  }
}

async function showCommand(opts: ParsedOptions): Promise<number> {
  const json = isJson(opts);
  let archAbs: string;
  try {
    archAbs = await resolveDocPath(getString(opts, "doc"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(`${cross()} ${msg}`);
    return 2;
  }
  const root = projectRoot(archAbs);
  const built = await buildContext(root, archAbs);
  if ("error" in built) {
    if (json) {
      console.log(JSON.stringify({ ok: false, error: built.error }, null, 2));
    } else console.error(`${cross()} ${built.error}`);
    return 2;
  }
  const alphaResult = await discoverAlphaDoc(root);
  for (const e of alphaResult.errors) {
    if (!json) console.error(`${yellow("warn:")} ${e.relPath}: ${e.message}`);
  }
  const rows = buildShowRows(alphaResult.doc?.doc ?? null, built.ctx);

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          file: alphaResult.doc?.relPath ?? null,
          alphas: rows,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  printShowText(rows, alphaResult.doc?.relPath ?? null);
  return 0;
}

async function promoteCommand(
  opts: ParsedOptions,
  alpha: AlphaName,
  state: string,
): Promise<number> {
  const json = isJson(opts);
  if (stateIndex(alpha, state) === -1) {
    const valid = STATE_LADDERS[alpha].join(" | ");
    const msg = `unknown state "${state}" for alpha "${alpha}". Valid: ${valid}`;
    if (json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(`${cross()} ${msg}`);
    return 2;
  }
  let archAbs: string;
  try {
    archAbs = await resolveDocPath(getString(opts, "doc"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(`${cross()} ${msg}`);
    return 2;
  }
  const root = projectRoot(archAbs);
  const built = await buildContext(root, archAbs);
  if ("error" in built) {
    if (json) {
      console.log(JSON.stringify({ ok: false, error: built.error }, null, 2));
    } else console.error(`${cross()} ${built.error}`);
    return 2;
  }
  const alphaResult = await discoverAlphaDoc(root);
  const existingDoc = alphaResult.doc?.doc;

  const targetIdx = stateIndex(alpha, state);
  const currentState = existingDoc?.alphas[alpha]?.state;
  const currentIdx =
    currentState !== undefined ? stateIndex(alpha, currentState) : -1;
  if (targetIdx <= currentIdx) {
    const msg =
      `cannot promote ${alpha} to "${state}" — already at "${currentState}" ` +
      `(promote walks UP the ladder; use \`archik alpha demote\` to walk back).`;
    if (json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(`${cross()} ${msg}`);
    return 1;
  }

  const result = evaluateAlphaState(alpha, state, built.ctx);
  if (result !== null && !result.ok) {
    const msg = `cannot promote ${alpha} to "${state}": ${result.reason}`;
    if (json) {
      console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    } else console.error(`${cross()} ${msg}`);
    return 1;
  }

  // Build updated doc.
  const note = getString(opts, "note");
  const newEntry = {
    state: state as never,
    ...(note ? { note } : {}),
  };
  const baseDoc: AlphaDocument = existingDoc ?? {
    version: "1.0",
    alphas: {},
  };
  const nextDoc: AlphaDocument = {
    version: baseDoc.version,
    ...(baseDoc.description ? { description: baseDoc.description } : {}),
    alphas: { ...baseDoc.alphas, [alpha]: newEntry },
  };
  // Round-trip through Zod to catch any type drift before write.
  const validated = AlphaDocumentSchema.safeParse(nextDoc);
  if (!validated.success) {
    const msg = validated.error.issues.map((i) => i.message).join("; ");
    if (json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(`${cross()} ${msg}`);
    return 1;
  }
  const targetAbs = alphaResult.doc?.abs ?? defaultAlphaFilePath(root);
  await writeAlphaDoc(targetAbs, validated.data);

  const subjectiveBadge = result === null ? " (subjective)" : "";
  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          alpha,
          state,
          file: path.relative(root, targetAbs).split(path.sep).join("/"),
          subjective: result === null,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `${tick()} promoted ${bold(alpha)} → ${cyan(state)}${dim(subjectiveBadge)}`,
    );
  }
  return 0;
}

async function demoteCommand(
  opts: ParsedOptions,
  alpha: AlphaName,
  state: string,
): Promise<number> {
  const json = isJson(opts);
  if (stateIndex(alpha, state) === -1) {
    const valid = STATE_LADDERS[alpha].join(" | ");
    const msg = `unknown state "${state}" for alpha "${alpha}". Valid: ${valid}`;
    if (json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(`${cross()} ${msg}`);
    return 2;
  }
  let archAbs: string;
  try {
    archAbs = await resolveDocPath(getString(opts, "doc"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(`${cross()} ${msg}`);
    return 2;
  }
  const root = projectRoot(archAbs);
  const alphaResult = await discoverAlphaDoc(root);
  if (alphaResult.doc === null) {
    const msg = `nothing to demote — no alphas file found.`;
    if (json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(`${cross()} ${msg}`);
    return 1;
  }
  const targetIdx = stateIndex(alpha, state);
  const currentState = alphaResult.doc.doc.alphas[alpha]?.state;
  if (currentState === undefined) {
    const msg = `cannot demote ${alpha} — alpha is unset.`;
    if (json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(`${cross()} ${msg}`);
    return 1;
  }
  const currentIdx = stateIndex(alpha, currentState);
  if (targetIdx >= currentIdx) {
    const msg =
      `cannot demote ${alpha} to "${state}" — already at "${currentState}" ` +
      `(demote walks DOWN the ladder; use \`archik alpha promote\` to advance).`;
    if (json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(`${cross()} ${msg}`);
    return 1;
  }
  const newEntry = { state: state as never };
  const baseDoc = alphaResult.doc.doc;
  const nextDoc: AlphaDocument = {
    version: baseDoc.version,
    ...(baseDoc.description ? { description: baseDoc.description } : {}),
    alphas: { ...baseDoc.alphas, [alpha]: newEntry },
  };
  const validated = AlphaDocumentSchema.safeParse(nextDoc);
  if (!validated.success) {
    const msg = validated.error.issues.map((i) => i.message).join("; ");
    if (json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.error(`${cross()} ${msg}`);
    return 1;
  }
  await writeAlphaDoc(alphaResult.doc.abs, validated.data);
  if (json) {
    console.log(
      JSON.stringify({ ok: true, alpha, state }, null, 2),
    );
  } else {
    console.log(`${tick()} demoted ${bold(alpha)} → ${cyan(state)}`);
  }
  return 0;
}

function printAlphaHelp(): void {
  console.log(`archik alpha — Essence alpha state tracker

USAGE
  archik alpha show [--json]
  archik alpha promote <alpha> <state> [--note '<text>'] [--json]
  archik alpha demote  <alpha> <state> [--json]

ALPHAS
  stakeholders | requirements | softwareSystem | work

NOTES
  - Promote walks UP the ladder; demote walks DOWN.
  - Promote runs the (alpha, state) machine check first; subjective
    states succeed without a check.
  - The file at .archik/alphas.archik.alphas.yaml is created on the
    first promote.
`);
}

export async function alphaCommand(opts: ParsedOptions): Promise<number> {
  const sub = opts._[0];
  switch (sub) {
    case "show":
    case undefined:
      return showCommand(opts);
    case "promote": {
      const alphaArg = opts._[1];
      const stateArg = opts._[2];
      if (!alphaArg || !stateArg) {
        console.error(`${cross()} usage: archik alpha promote <alpha> <state>`);
        return 2;
      }
      if (!isAlphaName(alphaArg)) {
        console.error(
          `${cross()} unknown alpha "${alphaArg}". Valid: ${ALPHA_NAMES.join(" | ")}`,
        );
        return 2;
      }
      return promoteCommand(opts, alphaArg, stateArg);
    }
    case "demote": {
      const alphaArg = opts._[1];
      const stateArg = opts._[2];
      if (!alphaArg || !stateArg) {
        console.error(`${cross()} usage: archik alpha demote <alpha> <state>`);
        return 2;
      }
      if (!isAlphaName(alphaArg)) {
        console.error(
          `${cross()} unknown alpha "${alphaArg}". Valid: ${ALPHA_NAMES.join(" | ")}`,
        );
        return 2;
      }
      return demoteCommand(opts, alphaArg, stateArg);
    }
    case "help":
    case "--help":
    case "-h":
      printAlphaHelp();
      return 0;
    default:
      console.error(`${cross()} unknown alpha subcommand: ${sub}\n`);
      printAlphaHelp();
      return 2;
  }
}
