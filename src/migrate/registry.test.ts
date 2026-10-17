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

  describe("#4 retire old artifacts", () => {
    const decision =
      "metadata:\n  suggestion:\n    decision:\n      context: c\n      decision: d\n      alternatives: [a]\n      consequences: e\n";

    it("does not apply to a clean project", async () => {
      await mkdir(path.join(dir, ".archik"), { recursive: true });
      await writeFile(path.join(dir, ".archik/main.archik.yaml"), "nodes: []\n");
      expect(byId(4).applies(createWorkspace(dir))).toBe(false);
    });

    it("moves retired files to .archik/retired keeping their layout", async () => {
      await mkdir(path.join(dir, ".archik/usecases"), { recursive: true });
      await mkdir(path.join(dir, ".archik/traces"), { recursive: true });
      await writeFile(path.join(dir, ".archik/main.archik.yaml"), "nodes: []\n");
      await writeFile(path.join(dir, ".archik/usecases/order.archik.uc.yaml"), "UC");
      await writeFile(path.join(dir, ".archik/login.archik.seq.yaml"), "SEQ");
      await writeFile(path.join(dir, ".archik/actors.archik.actors.yaml"), "A");
      await writeFile(path.join(dir, ".archik/alphas.archik.alphas.yaml"), "AL");
      await writeFile(path.join(dir, ".archik/traces/run.archik.trace.json"), "{}");
      const ws = createWorkspace(dir);
      expect(byId(4).applies(ws)).toBe(true);
      const r = byId(4).run(ws);
      expect(r.changed.sort()).toEqual([
        ".archik/retired/actors.archik.actors.yaml",
        ".archik/retired/alphas.archik.alphas.yaml",
        ".archik/retired/login.archik.seq.yaml",
        ".archik/retired/traces/run.archik.trace.json",
        ".archik/retired/usecases/order.archik.uc.yaml",
      ]);
      expect(ws.read(".archik/retired/usecases/order.archik.uc.yaml")).toBe("UC");
      expect(ws.exists(".archik/usecases/order.archik.uc.yaml")).toBe(false);
      expect(ws.exists(".archik/usecases")).toBe(false); // emptied folder removed
      expect(ws.exists(".archik/main.archik.yaml")).toBe(true);
      expect(r.needsJudgment.join(" ")).toMatch(/moved 5 retired file/);
      expect(byId(4).applies(ws)).toBe(false); // idempotent
    });

    it("strips retired keys from a pending sidecar and flags a missing decision", async () => {
      await mkdir(path.join(dir, ".archik"), { recursive: true });
      await writeFile(path.join(dir, ".archik/main.archik.yaml"), "nodes: []\n");
      await writeFile(
        path.join(dir, ".archik/main.archik.suggested.yaml"),
        "nodes:\n  - id: a\n    stereotype: entity\n",
      );
      const ws = createWorkspace(dir);
      const r = byId(4).run(ws);
      expect(ws.read(".archik/main.archik.suggested.yaml")).not.toContain("stereotype");
      expect(r.needsJudgment.join(" ")).toMatch(/no decision record/);
    });

    it("leaves a sidecar with a decision record alone", async () => {
      await mkdir(path.join(dir, ".archik"), { recursive: true });
      await writeFile(path.join(dir, ".archik/main.archik.suggested.yaml"), "nodes: []\n" + decision);
      expect(byId(4).applies(createWorkspace(dir))).toBe(false);
    });

    it("flags code, workflows and scripts that use removed features", async () => {
      await mkdir(path.join(dir, "tests"), { recursive: true });
      await mkdir(path.join(dir, "node_modules/x"), { recursive: true });
      await mkdir(path.join(dir, ".github/workflows"), { recursive: true });
      await writeFile(path.join(dir, "tests/order.test.ts"), 'import { trace } from "archik/trace";\n');
      await writeFile(path.join(dir, "node_modules/x/i.js"), 'require("archik/trace")\n');
      await writeFile(path.join(dir, ".github/workflows/ci.yml"), "with:\n  trace-fail-on: partial\n");
      await writeFile(path.join(dir, "package.json"), '{"scripts":{"cov":"archik trace --fail-on none"}}');
      const r = byId(4).run(createWorkspace(dir));
      const notes = r.needsJudgment.join("\n");
      expect(notes).toContain("tests/order.test.ts");
      expect(notes).not.toContain("node_modules");
      expect(notes).toContain(".github/workflows/ci.yml");
      expect(notes).toMatch(/package\.json scripts/);
      expect(r.changed).toEqual([]);
    });
  });
});
