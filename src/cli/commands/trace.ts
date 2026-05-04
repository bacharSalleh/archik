/**
 * `archik trace` — emit the use case × slice × test × seq × node
 * coverage matrix. The single command that surfaces traceability
 * end-to-end so CI can decide what to fail on.
 *
 * Default text output: one row per slice, with coverage summarised
 * as full / partial / none. `--json` emits the full TraceMatrix
 * shape (stable contract for CI scripts).
 *
 * Filters are intentionally narrow — list, then jq if you want more:
 *   --use-case <id>      one use case only
 *   --actor <id>         use cases involving this actor (primary or secondary)
 *   --status <s>         active | proposed | deprecated (slice status)
 *   --coverage <l>       full | partial | none (the level field)
 *
 * Exit codes (only set in text mode by default; CI scripts that want
 * "fail on partial" use `--fail-on partial` to opt in):
 *   0  success
 *   1  any row failed the --fail-on threshold
 *   2  argument error
 */
import { discoverDocs } from "../../io/discovery.ts";
import { discoverSeqDocs } from "../../io/seq-discovery.ts";
import { discoverUseCaseDocs } from "../../io/usecase-discovery.ts";
import {
  buildTraceMatrix,
  type TraceLevel,
  type TraceRow,
} from "../../domain/trace.ts";
import { bold, cross, cyan, dim, gray, tick, yellow } from "../colors.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { projectRoot, resolveDocPath } from "../resolveDocPath.ts";

const isJson = (opts: ParsedOptions): boolean => {
  const v = getString(opts, "json");
  return v !== undefined && v !== "false" && v !== "0";
};

function levelBadge(level: TraceLevel): string {
  if (level === "full") return tick();
  if (level === "partial") return yellow("~");
  return cross();
}

function fmtRow(row: TraceRow): string {
  const badge = levelBadge(row.level);
  const ucCol = `${row.useCase}/${row.slice}`.padEnd(34);
  const testsCol = `${row.tests.length}t`.padEnd(4);
  const realCol = row.realization ? "✓" : "—";
  const ecbCol = row.realization
    ? `${row.realization.participants.filter((p) => p.stereotype !== undefined).length}/${row.realization.participants.length}`
    : "—";
  const statusCol = row.status === "active" ? "" : ` ${dim("[" + row.status + "]")}`;
  return `${badge} ${cyan(ucCol)} ${testsCol} ${realCol.padEnd(2)} ${ecbCol.padEnd(5)} ${gray(row.useCaseFile)}${statusCol}`;
}

function printText(rows: TraceRow[], summary: ReturnType<typeof buildTraceMatrix>["summary"]): void {
  if (rows.length === 0) {
    console.log("No use case slices to trace.");
    return;
  }
  console.log(
    `${dim("    ")}${cyan("USE CASE / SLICE".padEnd(34))} ${dim("TST")}  ${dim("RZ")} ${dim("ECB")}   ${dim("FILE")}`,
  );
  for (const row of rows) console.log(fmtRow(row));
  console.log("");
  console.log(
    `${bold("totals")}: ${summary.slices} slice${summary.slices === 1 ? "" : "s"} across ${summary.useCases} use case${summary.useCases === 1 ? "" : "s"} — ${summary.fullyTraced} full, ${summary.partial} partial, ${summary.untraced} untraced`,
  );
}

const VALID_STATUS = new Set(["active", "proposed", "deprecated"]);
const VALID_LEVEL = new Set(["full", "partial", "none"]);
const VALID_FAIL_ON = new Set(["partial", "none"]);

export async function traceCommand(opts: ParsedOptions): Promise<number> {
  const json = isJson(opts);
  let abs: string;
  try {
    abs = await resolveDocPath(getString(opts, "doc"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    else console.error(`${cross()} ${message}`);
    return 2;
  }
  const root = projectRoot(abs);

  const archDiscovery = await discoverDocs(abs, root);
  const rootError = archDiscovery.errors.find((e) => e.abs === abs);
  if (rootError !== undefined) {
    if (json) console.log(JSON.stringify({ ok: false, error: rootError.message }, null, 2));
    else console.error(`${cross()} ${rootError.relPath}: ${rootError.message}`);
    return 2;
  }

  const ucDiscovery = await discoverUseCaseDocs(root);
  const seqDiscovery = await discoverSeqDocs(root);

  // Surface non-fatal load errors on stderr so they're visible without
  // polluting JSON stdout — same pattern as `q`.
  for (const e of [...ucDiscovery.errors, ...seqDiscovery.errors]) {
    if (!json) console.error(`${yellow("warn:")} ${e.relPath}: ${e.message}`);
  }

  const matrix = buildTraceMatrix(
    ucDiscovery.docs,
    seqDiscovery.docs,
    archDiscovery.docs,
  );

  // Apply filters.
  let rows = matrix.rows;
  const useCaseFilter = getString(opts, "use-case");
  if (useCaseFilter !== undefined) {
    rows = rows.filter((r) => r.useCase === useCaseFilter);
  }
  const actorFilter = getString(opts, "actor");
  if (actorFilter !== undefined) {
    rows = rows.filter(
      (r) =>
        r.primaryActor === actorFilter ||
        r.secondaryActors.includes(actorFilter),
    );
  }
  const statusFilter = getString(opts, "status");
  if (statusFilter !== undefined) {
    if (!VALID_STATUS.has(statusFilter)) {
      const msg = `--status must be active | proposed | deprecated`;
      if (json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
      else console.error(`${cross()} ${msg}`);
      return 2;
    }
    rows = rows.filter((r) => r.status === statusFilter);
  }
  const coverageFilter = getString(opts, "coverage");
  if (coverageFilter !== undefined) {
    if (!VALID_LEVEL.has(coverageFilter)) {
      const msg = `--coverage must be full | partial | none`;
      if (json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
      else console.error(`${cross()} ${msg}`);
      return 2;
    }
    rows = rows.filter((r) => r.level === coverageFilter);
  }

  // Recompute summary against filtered rows so the totals line + the
  // JSON summary describe what the caller asked for, not the
  // unfiltered universe.
  const summary = {
    useCases: new Set(rows.map((r) => r.useCase)).size,
    slices: rows.length,
    fullyTraced: rows.filter((r) => r.level === "full").length,
    partial: rows.filter((r) => r.level === "partial").length,
    untraced: rows.filter((r) => r.level === "none").length,
  };

  // CI gate: --fail-on partial fails on partial OR none; --fail-on none
  // fails only on none. Default is no gate (exit 0 always).
  const failOn = getString(opts, "fail-on");
  let exit = 0;
  if (failOn !== undefined) {
    if (!VALID_FAIL_ON.has(failOn)) {
      const msg = `--fail-on must be partial | none`;
      if (json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
      else console.error(`${cross()} ${msg}`);
      return 2;
    }
    if (failOn === "partial") {
      if (summary.partial > 0 || summary.untraced > 0) exit = 1;
    } else {
      if (summary.untraced > 0) exit = 1;
    }
  }

  if (json) {
    console.log(JSON.stringify({ ok: true, summary, rows }, null, 2));
  } else {
    printText(rows, summary);
  }
  return exit;
}
