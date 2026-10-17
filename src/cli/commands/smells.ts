/**
 * `archik smells [dir]` — structural smells read straight from the
 * code: folder import loops and oversized files. Works on any TS/JS
 * tree; no archik model needed. Advisory unless `--fail-on-warn`.
 *
 * Baseline (ratchet): `--update-baseline` saves today's findings to
 * `<dir>/.archik/smells-baseline.json`. When that file exists, the
 * report marks known findings and `--fail-on-warn` fails only on NEW
 * ones — so the gate works on code that already has debt.
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_SMELL_LIMITS,
  scanSmells,
  type SmellReport,
} from "../../structure/smells.ts";
import {
  BASELINE_FILE,
  compareToBaseline,
  makeBaseline,
  parseBaseline,
  type BaselineComparison,
} from "../../structure/baseline.ts";
import { bold, cross, cyan, dim, gray, green, tick, yellow } from "../colors.ts";
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

type Baseline = { path: string; comparison: BaselineComparison } | null;

export async function smellsCommand(opts: ParsedOptions): Promise<number> {
  const json = isJson(opts);
  const root = path.resolve(opts._[0] ?? ".");
  const fail = (message: string): number => {
    if (json) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    else console.error(`${cross()} ${message}`);
    return 2;
  };
  try {
    if (!(await stat(root)).isDirectory()) throw new Error();
  } catch {
    return fail(`not a directory: ${root}`);
  }

  const report = await scanSmells(root, {
    maxFileLines: intOpt(opts, "max-file-lines", DEFAULT_SMELL_LIMITS.maxFileLines),
  });

  const baselineOpt = getString(opts, "baseline");
  const baselinePath = path.resolve(
    root,
    baselineOpt !== undefined && baselineOpt !== "true" ? baselineOpt : BASELINE_FILE,
  );
  const baselineRel = path.relative(process.cwd(), baselinePath) || baselinePath;

  if (getString(opts, "update-baseline") === "true") {
    await mkdir(path.dirname(baselinePath), { recursive: true });
    await writeFile(baselinePath, JSON.stringify(makeBaseline(report), null, 2) + "\n", "utf-8");
    if (json) {
      console.log(JSON.stringify({ ok: true, baselineWritten: baselineRel, summary: report.summary }, null, 2));
    } else {
      console.log(
        `${tick()} baseline saved → ${baselineRel} ` +
          dim(`(${report.summary.folderLoops} loops, ${report.summary.oversizedFiles} oversized files)`),
      );
      console.log(dim("  Commit it. From now on --fail-on-warn fails only on new findings."));
    }
    return 0;
  }

  let baseline: Baseline = null;
  let text: string | null = null;
  try {
    text = await readFile(baselinePath, "utf-8");
  } catch {
    if (baselineOpt !== undefined && baselineOpt !== "true") {
      return fail(`baseline not found: ${baselineRel}`);
    }
  }
  if (text !== null) {
    try {
      baseline = { path: baselineRel, comparison: compareToBaseline(report, parseBaseline(text)) };
    } catch (err) {
      return fail(`${baselineRel}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          ...report,
          ...(baseline !== null
            ? {
                baseline: {
                  path: baseline.path,
                  newFolderLoops: baseline.comparison.newLoops.map((l) => l.folders),
                  newOversizedFiles: baseline.comparison.newOversizedFiles.map((f) => f.file),
                  fixedFolderLoops: baseline.comparison.fixedLoops,
                  fixedFiles: baseline.comparison.fixedFiles,
                },
              }
            : {}),
        },
        null,
        2,
      ),
    );
  } else {
    printText(report, baseline);
  }

  const failing =
    baseline === null
      ? report.summary.total
      : baseline.comparison.newLoops.length + baseline.comparison.newOversizedFiles.length;
  const failOnWarn = getString(opts, "fail-on-warn") === "true";
  return failOnWarn && failing > 0 ? 1 : 0;
}

function printText(report: SmellReport, baseline: Baseline): void {
  const newLoops = new Set(baseline?.comparison.newLoops ?? report.folderLoops);
  const newFiles = new Set(baseline?.comparison.newOversizedFiles ?? report.oversizedFiles);
  const tag = (isNew: boolean): string =>
    baseline === null ? "" : isNew ? ` ${bold(yellow("NEW"))}` : ` ${dim("(baseline)")}`;

  if (report.summary.total === 0) {
    console.log(`${tick()} no structural smells in ${report.filesScanned} files`);
  }

  if (report.folderLoops.length > 0) {
    console.log(`${bold("FOLDER LOOPS")} ${dim(`(${report.folderLoops.length})`)} — sibling folders that import each other`);
    for (const loop of report.folderLoops) {
      console.log(`\n  ${yellow("↻")} ${loop.folders.map((f) => cyan(f)).join(dim(" ↔ "))}${tag(newLoops.has(loop))}`);
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
      console.log(`  ${yellow(String(f.lines).padStart(6))}  ${f.file}${tag(newFiles.has(f))}`);
    }
    console.log("");
  }

  if (baseline !== null) {
    const c = baseline.comparison;
    if (c.fixedLoops.length + c.fixedFiles.length > 0) {
      console.log(`${bold(green("FIXED SINCE BASELINE"))}`);
      for (const l of c.fixedLoops) console.log(`  ${green("✓")} loop ${l.join(" ↔ ")}`);
      for (const f of c.fixedFiles) console.log(`  ${green("✓")} ${f}`);
      console.log(dim("  Tighten the baseline: archik smells --update-baseline"));
      console.log("");
    }
  }

  if (report.summary.total === 0) return;
  const s = report.summary;
  const newCount =
    baseline === null
      ? ""
      : ` — ${baseline.comparison.newLoops.length + baseline.comparison.newOversizedFiles.length} new since ${baseline.path}`;
  console.log(
    `${bold("smells")}: ${report.filesScanned} files → ` +
      `${s.folderLoops} folder loop${s.folderLoops === 1 ? "" : "s"}, ` +
      `${s.oversizedFiles} oversized file${s.oversizedFiles === 1 ? "" : "s"}${newCount}`,
  );
}
