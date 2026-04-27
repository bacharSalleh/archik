import { access, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  isSuggestion,
  stripSuggestionMarker,
  suggestionPath,
} from "../../domain/suggestion.ts";
import { diffDocuments } from "../../domain/diff.ts";
import { parseYaml, stringifyYaml } from "../../io/yaml.ts";
import type { ParsedOptions } from "../options.ts";
import { resolveDocPath } from "../resolveDocPath.ts";

type Sub = "show" | "accept" | "reject";

export async function suggestCommand(opts: ParsedOptions): Promise<number> {
  const sub = (opts._[0] as Sub | undefined) ?? "show";
  if (sub !== "show" && sub !== "accept" && sub !== "reject") {
    console.error(
      `✗ Unknown subcommand "${sub}". Use show / accept / reject.`,
    );
    return 1;
  }
  let mainPath: string;
  try {
    mainPath = await resolveDocPath(opts._[1] as string | undefined);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const sidecar = suggestionPath(mainPath);

  if (sub === "show") return show(mainPath, sidecar);
  if (sub === "accept") return accept(mainPath, sidecar);
  return reject(sidecar);
}

async function show(mainPath: string, sidecar: string): Promise<number> {
  if (!(await exists(sidecar))) {
    console.log(`No pending suggestion (${path.basename(sidecar)} not present).`);
    return 0;
  }
  const sidecarText = await readFile(sidecar, "utf-8");
  let sidecarDoc;
  try {
    sidecarDoc = parseYaml(sidecarText);
  } catch (err) {
    console.error(`✗ Suggestion file fails validation:`);
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
  console.log(`Suggestion: ${path.basename(sidecar)}`);
  if (sidecarDoc.metadata?.suggestion) {
    const s = sidecarDoc.metadata.suggestion;
    console.log(`  authored:  ${s.at}`);
    console.log(`  proposes:  changes to ${s.from}`);
    if (s.note) console.log(`  note:      ${s.note}`);
  }
  console.log("");

  if (!(await exists(mainPath))) {
    console.log(
      "(no current architecture file — accept will install this as the new one)",
    );
    return 0;
  }

  const mainDoc = parseYaml(await readFile(mainPath, "utf-8"));
  const diff = diffDocuments(mainDoc, sidecarDoc);
  const totals = {
    add: diff.nodes.added.length + diff.edges.added.length,
    rm: diff.nodes.removed.length + diff.edges.removed.length,
    ch: diff.nodes.changed.length + diff.edges.changed.length,
  };
  if (totals.add + totals.rm + totals.ch === 0) {
    console.log("Suggestion is identical to the current file.");
    return 0;
  }
  console.log(
    `Diff vs current: ${totals.add} added, ${totals.rm} removed, ${totals.ch} changed`,
  );
  console.log("");
  console.log("To preview visually:");
  console.log(`  archik diff ${path.basename(mainPath)} ${path.basename(sidecar)} --out diff.svg`);
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
