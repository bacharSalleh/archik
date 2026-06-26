import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runMigrations } from "./runner.ts";
import { readStamp } from "./version-stamp.ts";
import { MIGRATIONS } from "./registry.ts";

const latest = Math.max(...MIGRATIONS.map((m) => m.id));
const okValidate = async () => ({ ok: true, errors: [] as string[] });

let dir: string;
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "archik-run-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("runMigrations", () => {
  it("migrates a legacy project, archives, validates, and advances the stamp", async () => {
    await writeFile(path.join(dir, "architecture.archik.yaml"), "DOC");
    const run = await runMigrations(dir, { archikVersion: "0.16.1", validate: okValidate });
    expect(run.fromLevel).toBe(0);
    expect(run.toLevel).toBe(latest);
    expect(run.applied.some((a) => a.id === 1)).toBe(true);
    expect(run.archiveDir && existsSync(run.archiveDir)).toBe(true);
    expect(existsSync(path.join(dir, ".archik/main.archik.yaml"))).toBe(true);
    expect(readStamp(dir).migrationLevel).toBe(latest);
  });

  it("does nothing when already at the latest level", async () => {
    await mkdir(path.join(dir, ".archik"), { recursive: true });
    await writeFile(path.join(dir, ".archik/.version"), JSON.stringify({ archikVersion: "x", migrationLevel: latest }));
    const run = await runMigrations(dir, { archikVersion: "0.16.1", validate: okValidate });
    expect(run.fromLevel).toBe(latest);
    expect(run.toLevel).toBe(latest);
    expect(run.applied).toEqual([]);
    expect(run.archiveDir).toBeNull();
  });

  it("does NOT advance the stamp when validation fails", async () => {
    await writeFile(path.join(dir, "architecture.archik.yaml"), "DOC");
    const failValidate = async () => ({ ok: false, errors: ["boom"] });
    const run = await runMigrations(dir, { archikVersion: "0.16.1", validate: failValidate });
    expect(run.valid).toBe(false);
    expect(run.validationErrors).toContain("boom");
    expect(readStamp(dir).migrationLevel).toBe(0); // stamp NOT advanced
  });

  it("dry-run reports would-apply migrations and changes nothing", async () => {
    await writeFile(path.join(dir, "architecture.archik.yaml"), "DOC");
    const run = await runMigrations(dir, { archikVersion: "0.16.1", dryRun: true, validate: okValidate });
    expect(run.applied.some((a) => a.id === 1)).toBe(true);
    expect(run.archiveDir).toBeNull();
    expect(existsSync(path.join(dir, "architecture.archik.yaml"))).toBe(true); // untouched
    expect(existsSync(path.join(dir, ".archik/main.archik.yaml"))).toBe(false);
    expect(readStamp(dir).migrationLevel).toBe(0);
  });

  it("collects needsJudgment from migration #2", async () => {
    await mkdir(path.join(dir, ".archik"), { recursive: true });
    await writeFile(path.join(dir, ".archik/main.archik.yaml"), "DOC");
    const run = await runMigrations(dir, { archikVersion: "0.16.1", validate: okValidate });
    expect(run.needsJudgment.join(" ")).toMatch(/use case/i);
  });
});
