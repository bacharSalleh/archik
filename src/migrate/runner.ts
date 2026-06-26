import { archiveProject } from "./archive.ts";
import { MIGRATIONS } from "./registry.ts";
import { readStamp, writeStamp } from "./version-stamp.ts";
import { createWorkspace } from "./workspace.ts";

export type MigrationRun = {
  fromLevel: number;
  toLevel: number;
  applied: Array<{ id: number; title: string; changed: string[] }>;
  skipped: Array<{ id: number; title: string }>;
  needsJudgment: string[];
  archiveDir: string | null;
  valid: boolean;
  validationErrors: string[];
};

export type RunOpts = {
  archikVersion: string;
  dryRun?: boolean;
  validate: (root: string) => Promise<{ ok: boolean; errors: string[] }>;
};

const latestLevel = (): number => Math.max(0, ...MIGRATIONS.map((m) => m.id));

export async function runMigrations(root: string, opts: RunOpts): Promise<MigrationRun> {
  const fromLevel = readStamp(root).migrationLevel;
  const candidates = MIGRATIONS.filter((m) => m.id > fromLevel);

  const base: MigrationRun = {
    fromLevel,
    toLevel: fromLevel,
    applied: [],
    skipped: [],
    needsJudgment: [],
    archiveDir: null,
    valid: true,
    validationErrors: [],
  };

  if (candidates.length === 0) return base;

  const ws = createWorkspace(root);

  // Dry-run: report which candidates WOULD apply; touch nothing.
  if (opts.dryRun) {
    for (const m of candidates) {
      if (m.applies(ws)) base.applied.push({ id: m.id, title: m.title, changed: [] });
      else base.skipped.push({ id: m.id, title: m.title });
    }
    return base;
  }

  base.archiveDir = archiveProject(root);

  for (const m of candidates) {
    if (m.applies(ws)) {
      const r = m.run(ws);
      base.applied.push({ id: m.id, title: m.title, changed: r.changed });
      base.needsJudgment.push(...r.needsJudgment);
    } else {
      base.skipped.push({ id: m.id, title: m.title });
    }
  }

  const v = await opts.validate(root);
  base.valid = v.ok;
  base.validationErrors = v.errors;

  if (v.ok) {
    const toLevel = latestLevel();
    base.toLevel = toLevel;
    writeStamp(root, { archikVersion: opts.archikVersion, migrationLevel: toLevel });
  }

  return base;
}
