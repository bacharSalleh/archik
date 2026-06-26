import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWorkspace } from "./workspace.ts";
import { MIGRATIONS } from "./registry.ts";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "archik-reg-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const byId = (id: number) => MIGRATIONS.find((m) => m.id === id)!;

describe("migration registry", () => {
  it("is ordered by ascending id and ids are unique", () => {
    const ids = MIGRATIONS.map((m) => m.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("#1 moves a legacy root file into .archik/main and is idempotent", async () => {
    await writeFile(path.join(dir, "architecture.archik.yaml"), "DOC");
    const ws = createWorkspace(dir);
    const m1 = byId(1);
    expect(m1.applies(ws)).toBe(true);
    const r = m1.run(ws);
    expect(r.changed).toContain(".archik/main.archik.yaml");
    expect(ws.read(".archik/main.archik.yaml")).toBe("DOC");
    expect(ws.exists("architecture.archik.yaml")).toBe(false);
    expect(m1.applies(ws)).toBe(false); // idempotent: nothing to do now
  });

  it("#1 does not apply when already on the .archik layout", async () => {
    await mkdir(path.join(dir, ".archik"), { recursive: true });
    await writeFile(path.join(dir, ".archik/main.archik.yaml"), "DOC");
    expect(byId(1).applies(createWorkspace(dir))).toBe(false);
  });

  it("#2 flags missing use cases as needsJudgment without changing files", async () => {
    await mkdir(path.join(dir, ".archik"), { recursive: true });
    await writeFile(path.join(dir, ".archik/main.archik.yaml"), "DOC");
    const ws = createWorkspace(dir);
    const m2 = byId(2);
    expect(m2.applies(ws)).toBe(true);
    const r = m2.run(ws);
    expect(r.changed).toEqual([]);
    expect(r.needsJudgment.join(" ")).toMatch(/use case/i);
  });

  it("#2 does not apply when use cases already exist", async () => {
    await mkdir(path.join(dir, ".archik/usecases"), { recursive: true });
    await writeFile(path.join(dir, ".archik/main.archik.yaml"), "DOC");
    await writeFile(path.join(dir, ".archik/usecases/x.archik.uc.yaml"), "UC");
    expect(byId(2).applies(createWorkspace(dir))).toBe(false);
  });
});
