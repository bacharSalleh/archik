import { access, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  isSuggestion,
  stripSuggestionMarker,
  suggestionPath,
} from "../../domain/suggestion.ts";
import { diffDocuments } from "../../domain/diff.ts";
import { parseYaml, stringifyYaml } from "../../io/yaml.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { resolveDocPath } from "../resolveDocPath.ts";

type Sub = "show" | "accept" | "reject";

const isJson = (opts: ParsedOptions): boolean => {
  const v = getString(opts, "json");
  return v !== undefined && v !== "false" && v !== "0";
};

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
