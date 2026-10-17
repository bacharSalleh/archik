/**
 * `archik smells [dir]` — structural smells read straight from the
 * code: folder import loops and oversized files. Works on any TS/JS
 * tree; no archik model needed. Advisory unless `--fail-on-warn`.
 */
import { stat } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_SMELL_LIMITS,
  scanSmells,
  type SmellReport,
} from "../../structure/smells.ts";
import { bold, cross, cyan, dim, gray, tick, yellow } from "../colors.ts";
import { getString, type ParsedOptions } from "../options.ts";

const isJson = (opts: ParsedOptions): boolean => {
  const v = getString(opts, "json");
  return v !== undefined && v !== "false" && v !== "0";
};

function intOpt(opts: ParsedOptions, name: string, fallback: number): number {
  const raw = getString(opts, name);
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function smellsCommand(opts: ParsedOptions): Promise<number> {
  const json = isJson(opts);
  const root = path.resolve(opts._[0] ?? ".");
  try {
    if (!(await stat(root)).isDirectory()) throw new Error();
  } catch {
    const message = `not a directory: ${root}`;
    if (json) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    else console.error(`${cross()} ${message}`);
    return 2;
  }

  const report = await scanSmells(root, {
    maxFileLines: intOpt(opts, "max-file-lines", DEFAULT_SMELL_LIMITS.maxFileLines),
  });

  if (json) {
    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
  } else {
    printText(report);
  }

  const failOnWarn = getString(opts, "fail-on-warn") === "true";
  return failOnWarn && report.summary.total > 0 ? 1 : 0;
}

function printText(report: SmellReport): void {
  if (report.summary.total === 0) {
    console.log(`${tick()} no structural smells in ${report.filesScanned} files`);
    return;
  }

  if (report.folderLoops.length > 0) {
    console.log(`${bold("FOLDER LOOPS")} ${dim(`(${report.folderLoops.length})`)} — sibling folders that import each other`);
    for (const loop of report.folderLoops) {
      console.log(`\n  ${yellow("↻")} ${loop.folders.map((f) => cyan(f)).join(dim(" ↔ "))}`);
      console.log(dim(`    ${loop.edges.length} folder edges in this loop (--json lists all)`));
      if (loop.directPairs.length > 0) {
        console.log(`    ${bold("import each other directly:")}`);
        for (const [a, b] of loop.directPairs) console.log(`      ${a} ⇄ ${b}`);
      }
      console.log(`    ${bold("cheapest to cut")} ${dim("(fewest imports)")}:`);
      for (const e of loop.cheapestCuts) {
        console.log(`      ${e.from} → ${e.to}  ${dim(`(${e.imports} import${e.imports === 1 ? "" : "s"})`)}`);
        for (const ex of e.examples) {
          console.log(`        ${gray(ex.file)}  ${dim(`imports "${ex.specifier}"`)}`);
        }
      }
    }
    console.log("");
  }

  if (report.oversizedFiles.length > 0) {
    const limit = report.oversizedFiles[0]!.limit;
    console.log(`${bold("OVERSIZED FILES")} ${dim(`(${report.oversizedFiles.length})`)} — more than ${limit} lines`);
    for (const f of report.oversizedFiles) {
      console.log(`  ${yellow(String(f.lines).padStart(6))}  ${f.file}`);
    }
    console.log("");
  }

  const s = report.summary;
  console.log(
    `${bold("smells")}: ${report.filesScanned} files → ` +
      `${s.folderLoops} folder loop${s.folderLoops === 1 ? "" : "s"}, ` +
      `${s.oversizedFiles} oversized file${s.oversizedFiles === 1 ? "" : "s"}`,
  );
}
