/**
 * Smells baseline — the ratchet that makes `archik smells` usable as
 * a CI gate on existing code. Save today's findings once; afterwards
 * only NEW findings fail the build:
 *
 *   - a folder loop whose folder set is not in the baseline (a loop
 *     that pulled in another folder counts as new)
 *   - an oversized file that is not in the baseline, or that grew
 *     past its baseline line count
 *
 * Known debt stays visible in the report but does not fail. Fixed
 * findings are listed so the baseline can be tightened.
 */
import type { FolderLoop, OversizedFile, SmellReport } from "./smells.ts";

export type SmellBaseline = {
  version: 1;
  createdAt: string;
  folderLoops: string[][];
  oversizedFiles: Array<{ file: string; lines: number }>;
};

export type BaselineComparison = {
  newLoops: FolderLoop[];
  newOversizedFiles: OversizedFile[];
  /** Baseline loops no longer present (as recorded). */
  fixedLoops: string[][];
  /** Baseline files no longer oversized. */
  fixedFiles: string[];
};

/** Default location, relative to the scanned directory. */
export const BASELINE_FILE = ".archik/smells-baseline.json";

const loopKey = (folders: readonly string[]): string => [...folders].sort().join("\n");

export function makeBaseline(
  report: Pick<SmellReport, "folderLoops" | "oversizedFiles">,
  now: Date = new Date(),
): SmellBaseline {
  return {
    version: 1,
    createdAt: now.toISOString(),
    folderLoops: report.folderLoops.map((l) => [...l.folders].sort()),
    oversizedFiles: report.oversizedFiles.map((f) => ({ file: f.file, lines: f.lines })),
  };
}

export function parseBaseline(text: string): SmellBaseline {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("smells baseline is not valid JSON");
  }
  const b = raw as Partial<SmellBaseline> | null;
  const ok =
    b !== null &&
    typeof b === "object" &&
    b.version === 1 &&
    Array.isArray(b.folderLoops) &&
    b.folderLoops.every((l) => Array.isArray(l) && l.every((f) => typeof f === "string")) &&
    Array.isArray(b.oversizedFiles) &&
    b.oversizedFiles.every((f) => typeof f?.file === "string" && typeof f?.lines === "number");
  if (!ok) throw new Error("smells baseline has an unknown shape (expected version 1)");
  return b as SmellBaseline;
}

export function compareToBaseline(
  report: Pick<SmellReport, "folderLoops" | "oversizedFiles">,
  baseline: SmellBaseline,
): BaselineComparison {
  const knownLoops = new Set(baseline.folderLoops.map(loopKey));
  const knownFiles = new Map(baseline.oversizedFiles.map((f) => [f.file, f.lines]));
  const nowLoops = new Set(report.folderLoops.map((l) => loopKey(l.folders)));
  const nowFiles = new Set(report.oversizedFiles.map((f) => f.file));
  return {
    newLoops: report.folderLoops.filter((l) => !knownLoops.has(loopKey(l.folders))),
    newOversizedFiles: report.oversizedFiles.filter((f) => {
      const was = knownFiles.get(f.file);
      return was === undefined || f.lines > was;
    }),
    fixedLoops: baseline.folderLoops.filter((l) => !nowLoops.has(loopKey(l))),
    fixedFiles: baseline.oversizedFiles.map((f) => f.file).filter((f) => !nowFiles.has(f)),
  };
}
