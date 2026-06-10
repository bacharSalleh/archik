/**
 * `archik patterns` — the self-evolution pattern library.
 *
 * Ships with the package (patterns/*.md + *.blueprint.yaml):
 * named, documented architecture patterns for building self-evolving
 * systems, each with intent, rules, trade-offs, and — where the
 * pattern is structural — a blueprint that `apply` stages into the
 * user's diagram THROUGH THE SUGGESTION SIDECAR. Even scaffolding a
 * pattern respects the approval gate.
 *
 * Subcommands:
 *   list          — every pattern with its one-line intent
 *   show <id>     — print the full pattern doc
 *   apply <id>    — merge the blueprint into the diagram as a sidecar
 */
import { existsSync } from "node:fs";
import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { suggestionPath } from "../../domain/suggestion.ts";
import { formatErrors, validateDocument } from "../../domain/validate.ts";
import { parseYaml, stringifyYaml } from "../../io/yaml.ts";
import type { Document } from "../../domain/types.ts";
import { bold, cross, cyan, dim, tick } from "../colors.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { pkgRoot } from "../paths.ts";
import { resolveDocPath } from "../resolveDocPath.ts";

export type PatternInfo = {
  id: string;
  name: string;
  intent: string;
  hasBlueprint: boolean;
};

function patternsDir(): string {
  return path.join(pkgRoot(), "patterns");
}

export async function listPatterns(): Promise<PatternInfo[]> {
  const dir = patternsDir();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: PatternInfo[] = [];
  for (const file of names.sort()) {
    if (!file.endsWith(".md")) continue;
    const id = file.slice(0, -3);
    const text = await readFile(path.join(dir, file), "utf-8");
    const lines = text.split("\n");
    const name = lines.find((l) => l.startsWith("# "))?.slice(2) ?? id;
    const intent =
      lines
        .find((l) => l.startsWith("> Intent:"))
        ?.slice("> Intent:".length)
        .trim() ?? "";
    out.push({
      id,
      name,
      intent,
      hasBlueprint: names.includes(`${id}.blueprint.yaml`),
    });
  }
  return out;
}

async function listCommand(opts: ParsedOptions): Promise<number> {
  const patterns = await listPatterns();
  const json = getString(opts, "json") !== undefined;
  if (json) {
    console.log(JSON.stringify({ ok: true, patterns }, null, 2));
    return 0;
  }
  console.log(bold("self-evolution patterns"));
  for (const p of patterns) {
    const badge = p.hasBlueprint ? cyan("apply") : dim("doc  ");
    console.log(`  ${badge}  ${bold(p.id.padEnd(22))} ${p.intent}`);
  }
  console.log("");
  console.log(`Read one:  ${cyan("archik patterns show <id>")}`);
  console.log(
    `Scaffold:  ${cyan("archik patterns apply <id>")} ${dim("(stages a suggestion sidecar)")}`,
  );
  return 0;
}

async function showCommand(opts: ParsedOptions): Promise<number> {
  const id = opts._[1];
  if (id === undefined) {
    console.error(`${cross()} usage: archik patterns show <id>`);
    return 2;
  }
  const file = path.join(patternsDir(), `${id}.md`);
  if (!existsSync(file)) {
    const known = (await listPatterns()).map((p) => p.id).join(" | ");
    console.error(`${cross()} unknown pattern "${id}". Known: ${known}`);
    return 2;
  }
  console.log(await readFile(file, "utf-8"));
  return 0;
}

type Blueprint = {
  nodes?: Document["nodes"];
  edges?: Document["edges"];
};

async function applyCommand(opts: ParsedOptions): Promise<number> {
  const id = opts._[1];
  if (id === undefined) {
    console.error(`${cross()} usage: archik patterns apply <id>`);
    return 2;
  }
  const docFile = path.join(patternsDir(), `${id}.md`);
  if (!existsSync(docFile)) {
    const known = (await listPatterns()).map((p) => p.id).join(" | ");
    console.error(`${cross()} unknown pattern "${id}". Known: ${known}`);
    return 2;
  }
  const blueprintFile = path.join(patternsDir(), `${id}.blueprint.yaml`);
  if (!existsSync(blueprintFile)) {
    console.error(
      `${cross()} pattern "${id}" has no blueprint — it describes a workflow, not components.`,
    );
    console.error(
      `  Read it instead: ${cyan(`archik patterns show ${id}`)}`,
    );
    return 1;
  }

  let mainPath: string;
  try {
    mainPath = await resolveDocPath(getString(opts, "doc"));
  } catch (err) {
    console.error(`${cross()} ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const sidecar = suggestionPath(mainPath);
  if (existsSync(sidecar)) {
    console.error(
      `${cross()} a suggestion sidecar already exists (${path.basename(sidecar)}). ` +
        `Resolve it first: archik suggest accept | reject`,
    );
    return 1;
  }

  let mainDoc: Document;
  try {
    mainDoc = parseYaml(await readFile(mainPath, "utf-8"));
  } catch (err) {
    console.error(`${cross()} ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const blueprint = YAML.parse(
    await readFile(blueprintFile, "utf-8"),
  ) as Blueprint;
  const newNodes = blueprint.nodes ?? [];
  const newEdges = blueprint.edges ?? [];

  const existingIds = new Set([
    ...mainDoc.nodes.map((n) => n.id),
    ...mainDoc.edges.map((e) => e.id),
  ]);
  const collisions = [...newNodes, ...newEdges]
    .map((x) => x.id)
    .filter((nid) => existingIds.has(nid));
  if (collisions.length > 0) {
    console.error(
      `${cross()} the diagram already has ids from this blueprint: ${collisions.join(", ")}`,
    );
    return 1;
  }

  const merged: Document = {
    ...mainDoc,
    nodes: [...mainDoc.nodes, ...newNodes],
    edges: [...mainDoc.edges, ...newEdges],
  };
  const validated = validateDocument(merged);
  if (!validated.ok) {
    console.error(`${cross()} blueprint merge fails validation:`);
    console.error(formatErrors(validated.errors));
    return 1;
  }
  const stamped: Document = {
    ...validated.value,
    metadata: {
      ...(validated.value.metadata ?? {}),
      suggestion: {
        from: path.basename(mainPath),
        at: new Date().toISOString(),
        note: `pattern "${id}" blueprint (${newNodes.length} nodes, ${newEdges.length} edges)`,
      },
    },
  };
  const tmp = `${sidecar}.tmp`;
  await writeFile(tmp, stringifyYaml(stamped), "utf-8");
  await rename(tmp, sidecar);

  console.log(`${tick()} pattern staged → ${path.basename(sidecar)}`);
  console.log(
    `  ${newNodes.length} proposed nodes, ${newEdges.length} edges — nothing applied yet.`,
  );
  console.log("");
  console.log("Review on the canvas, or:");
  console.log(`  ${cyan("archik suggest show")}`);
  console.log(`  ${cyan("archik suggest accept")}`);
  return 0;
}

function printPatternsHelp(): void {
  console.log(`archik patterns — self-evolution pattern library

USAGE
  archik patterns list          all patterns with one-line intents
  archik patterns show <id>     print the full pattern document
  archik patterns apply <id>    stage the blueprint as a suggestion
                                sidecar (approval-gated, like any change)

PATTERNS SHIP WITH ARCHIK
  evolution-loop          observe → reflect → propose → validate →
                          apply → measure, as components (has blueprint)
  sidecar-approval-gate   machines propose via sidecar; humans accept
  learned-overlay         approved lessons layered over a fixed prompt
  truth-chain             model verified vs itself, code, production
  feedback-pipeline       every user correction becomes a signal
`);
}

export async function patternsCommand(opts: ParsedOptions): Promise<number> {
  const sub = opts._[0] ?? "list";
  switch (sub) {
    case "list":
      return listCommand(opts);
    case "show":
      return showCommand(opts);
    case "apply":
      return applyCommand(opts);
    case "help":
    case "--help":
    case "-h":
      printPatternsHelp();
      return 0;
    default:
      console.error(`${cross()} unknown patterns subcommand: ${sub}\n`);
      printPatternsHelp();
      return 2;
  }
}
