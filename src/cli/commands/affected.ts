/**
 * `archik affected` — map a change set back onto the model. The daily
 * "what am I touching?" command: takes the files that changed (from
 * git, or an explicit `--files` list), and reports the affected
 * nodes, use case slices, tests to run, and seq diagrams that may
 * have gone stale.
 *
 *   archik affected                       # working tree vs HEAD
 *   archik affected --since main          # this branch vs main
 *   archik affected --files src/api/x.ts  # explicit list, no git
 *
 * Changed files come from `git diff --name-only <ref>` plus untracked
 * files (`git ls-files --others --exclude-standard`), translated to
 * project-root-relative paths when the git toplevel sits above the
 * project root.
 *
 * Exit codes:
 *   0  success (even when nothing is affected)
 *   1  git / file errors
 *   2  argument errors
 */
import {
  buildAffectedReport,
  type AffectedReport,
} from "../../domain/affected.ts";
import { runGit } from "../git.ts";
import { discoverDocs } from "../../io/discovery.ts";
import { discoverSeqDocs } from "../../io/seq-discovery.ts";
import { discoverUseCaseDocs } from "../../io/usecase-discovery.ts";
import { bold, cross, cyan, dim, gray, yellow } from "../colors.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { projectRoot, resolveDocPath } from "../resolveDocPath.ts";

const isJson = (opts: ParsedOptions): boolean => {
  const v = getString(opts, "json");
  return v !== undefined && v !== "false" && v !== "0";
};

/** Changed files from git, relative to the project root. Both
 *  commands run with cwd = project root and emit root-relative paths:
 *  `--relative` pins `git diff` to the cwd (its default is
 *  toplevel-relative), and `git ls-files` is cwd-relative already.
 *  This also scopes a monorepo to the project's subtree for free. */
function changedFromGit(
  root: string,
  since: string,
): { ok: true; files: string[] } | { ok: false; error: string } {
  const diff = runGit(["diff", "--name-only", "--relative", since], root);
  if (!diff.ok) return { ok: false, error: diff.error };
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"], root);
  if (!untracked.ok) return { ok: false, error: untracked.error };

  const files = [...diff.out.split("\n"), ...untracked.out.split("\n")]
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return { ok: true, files };
}

export async function affectedCommand(opts: ParsedOptions): Promise<number> {
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

  // Where the change set comes from: --files wins, otherwise git.
  let changed: string[];
  const filesOpt = getString(opts, "files");
  if (filesOpt !== undefined && filesOpt !== "true") {
    changed = filesOpt.split(",").map((f) => f.trim()).filter((f) => f.length > 0);
  } else {
    const since = getString(opts, "since") ?? "HEAD";
    const fromGit = changedFromGit(root, since);
    if (!fromGit.ok) {
      if (json) console.log(JSON.stringify({ ok: false, error: fromGit.error }, null, 2));
      else console.error(`${cross()} git: ${fromGit.error}`);
      return 1;
    }
    changed = fromGit.files;
  }

  const archDiscovery = await discoverDocs(abs, root);
  const rootError = archDiscovery.errors.find((e) => e.abs === abs);
  if (rootError !== undefined) {
    if (json) console.log(JSON.stringify({ ok: false, error: rootError.message }, null, 2));
    else console.error(`${cross()} ${rootError.relPath}: ${rootError.message}`);
    return 1;
  }
  const ucDiscovery = await discoverUseCaseDocs(root);
  const seqDiscovery = await discoverSeqDocs(root);
  for (const e of [...ucDiscovery.errors, ...seqDiscovery.errors]) {
    if (!json) console.error(`${yellow("warn:")} ${e.relPath}: ${e.message}`);
  }

  const report = buildAffectedReport(
    changed,
    archDiscovery.docs,
    ucDiscovery.docs,
    seqDiscovery.docs,
  );

  if (json) {
    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
  } else {
    printText(report);
  }
  return 0;
}

function printText(report: AffectedReport): void {
  if (report.summary.changedFiles === 0) {
    console.log("No changed files.");
    return;
  }

  if (report.nodes.length > 0) {
    console.log(`${bold("NODES")} ${dim(`(${report.nodes.length})`)}`);
    for (const n of report.nodes) {
      console.log(
        `  ~ ${cyan(n.id.padEnd(22))} ${dim(`(${n.kind})`)}  ${n.files.length} file${n.files.length === 1 ? "" : "s"} in ${gray(n.sourcePath)}`,
      );
    }
    console.log("");
  }

  if (report.slices.length > 0) {
    console.log(`${bold("USE CASE SLICES")} ${dim(`(${report.slices.length})`)}`);
    for (const s of report.slices) {
      console.log(
        `  ~ ${cyan(`${s.useCase}/${s.slice}`.padEnd(30))} via ${s.via.join("+")}`,
      );
    }
    console.log("");
  }

  if (report.testsToRun.length > 0) {
    console.log(`${bold("TESTS TO RUN")} ${dim(`(${report.testsToRun.length})`)}`);
    for (const t of report.testsToRun) console.log(`  • ${t}`);
    console.log("");
  }

  if (report.staleSeqs.length > 0) {
    console.log(`${bold("SEQ DIAGRAMS TO RE-CHECK")} ${dim(`(${report.staleSeqs.length})`)}`);
    for (const s of report.staleSeqs) {
      console.log(`  ? ${gray(s.seqFile)}  ${dim(`touches ${s.nodes.join(", ")}`)}`);
    }
    console.log("");
  }

  if (report.modelFiles.length > 0) {
    console.log(`${bold("MODEL FILES CHANGED")} ${dim(`(${report.modelFiles.length})`)}`);
    for (const f of report.modelFiles) console.log(`  • ${gray(f)}`);
    console.log("");
  }

  if (report.unmapped.length > 0) {
    console.log(
      `${bold("UNMAPPED")} ${dim(`(${report.unmapped.length})`)} — no node or test claims these`,
    );
    for (const f of report.unmapped) console.log(`  ${yellow("?")} ${f}`);
    console.log("");
  }

  const s = report.summary;
  console.log(
    `${bold("affected")}: ${s.changedFiles} changed file${s.changedFiles === 1 ? "" : "s"} → ` +
      `${s.nodes} node${s.nodes === 1 ? "" : "s"}, ${s.slices} slice${s.slices === 1 ? "" : "s"} ` +
      `across ${s.useCases} use case${s.useCases === 1 ? "" : "s"}, ${s.unmapped} unmapped`,
  );
}
