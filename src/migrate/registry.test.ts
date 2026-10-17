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

  it("#2 is retired and never applies", async () => {
    await mkdir(path.join(dir, ".archik"), { recursive: true });
    await writeFile(path.join(dir, ".archik/main.archik.yaml"), "DOC");
    expect(byId(2).applies(createWorkspace(dir))).toBe(false);
  });

  it("#3 strips stereotype and seqFiles from nodes in all model files", async () => {
    await mkdir(path.join(dir, ".archik/sub"), { recursive: true });
    await writeFile(
      path.join(dir, ".archik/main.archik.yaml"),
      `# keep me\nnodes:\n  - id: a\n    description: ${"word ".repeat(40).trim()}\n    stereotype: control\n    seqFiles: [x.archik.seq.yaml]\n    name: A\n`,
    );
    await writeFile(
      path.join(dir, ".archik/sub/b.archik.yaml"),
      "nodes:\n  - id: b\n    stereotype: entity\n",
    );
    const ws = createWorkspace(dir);
    const m3 = byId(3);
    expect(m3.applies(ws)).toBe(true);
    const r = m3.run(ws);
    expect(r.changed.sort()).toEqual([".archik/main.archik.yaml", ".archik/sub/b.archik.yaml"]);
    const main = ws.read(".archik/main.archik.yaml");
    expect(main).toContain("# keep me");
    expect(main).toContain("name: A");
    expect(main).toContain(`description: ${"word ".repeat(40).trim()}\n`);
    expect(main).not.toMatch(/stereotype|seqFiles/);
    expect(ws.read(".archik/sub/b.archik.yaml")).not.toMatch(/stereotype/);
    expect(m3.applies(ws)).toBe(false);
  });
});
