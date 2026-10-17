/**
 * `archik migrate [--dry-run] [--json]` — bring this project's archik
 * files up to the installed version: archive `.archik/`, run every
 * migration newer than `.archik/.version`, validate, advance the stamp,
 * and list what still needs a human (or `/archik:migrate`).
 *
 * `archik upgrade --migrate` runs this through the freshly installed
 * binary, so the migrations always come from the new version.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { runMigrations, type MigrationRun } from "../../migrate/runner.ts";
import { arrow, bold, cross, dim, tick, yellow } from "../colors.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { pkgRoot } from "../paths.ts";
import { validateCommand } from "./validate.ts";

function readOwnVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(pkgRoot(), "package.json"), "utf-8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export async function migrateCommand(opts: ParsedOptions): Promise<number> {
  const json = getString(opts, "json") === "true";
  const dryRun = getString(opts, "dry-run") === "true";

  const run: MigrationRun = await runMigrations(process.cwd(), {
    archikVersion: readOwnVersion(),
    dryRun,
    // Run validateCommand in-process, suppressing its console output so the
    // migrate report stays clean. Errors are surfaced via the return value.
    validate: async () => {
      const origLog = console.log;
      const origErr = console.error;
      const lines: string[] = [];
      console.log = (...a: unknown[]) => { lines.push(a.join(" ")); };
      console.error = (...a: unknown[]) => { lines.push(a.join(" ")); };
      let code: number;
      try {
        code = await validateCommand({ _: [] });
      } finally {
        console.log = origLog;
        console.error = origErr;
      }
      return { ok: code === 0, errors: code === 0 ? [] : lines };
    },
  });

  if (json) {
    console.log(JSON.stringify(run, null, 2));
    return run.valid ? 0 : 1;
  }

  if (run.fromLevel === run.toLevel && run.applied.length === 0) {
    if (!dryRun) {
      console.log(`${tick()} Already up to date — nothing to migrate.`);
    } else {
      console.log(`${bold("Would migrate")} (dry run — nothing written): nothing to do.`);
    }
    return 0;
  }

  if (dryRun) {
    console.log(`${bold("Would migrate")} (dry run — nothing written):`);
    for (const a of run.applied) {
      console.log(`  ${arrow()} #${a.id} ${a.title}`);
    }
    return 0;
  }

  console.log(`${bold("Migrated")} level ${run.fromLevel} → ${run.toLevel}:`);
  for (const a of run.applied) {
    console.log(`  ${tick()} #${a.id} ${a.title}`);
  }
  if (run.archiveDir !== null) {
    console.log(`  ${dim("archived to " + run.archiveDir)}`);
  }

  if (!run.valid) {
    console.error(
      `${cross()} Post-migration validate failed — restore from the archive and fix:`,
    );
    for (const e of run.validationErrors) {
      console.error(`    ${e}`);
    }
    return 1;
  }

  for (const n of run.needsJudgment) {
    console.log(`${yellow("ⓘ")} ${n}`);
  }
  if (run.needsJudgment.length > 0) {
    console.log(dim("  Run `/archik:migrate` in Claude Code to finish these."));
  }
  return 0;
}
