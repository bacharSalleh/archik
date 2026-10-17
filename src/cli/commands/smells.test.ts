import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { smellsCommand } from "./smells.ts";

describe("smellsCommand", () => {
  let root: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "archik-smells-cli-"));
    await mkdir(path.join(root, "src/a"), { recursive: true });
    await mkdir(path.join(root, "src/b"), { recursive: true });
    await writeFile(path.join(root, "src/a/x.ts"), 'import "../b/y";\n');
    await writeFile(path.join(root, "src/b/y.ts"), 'import "../a/x";\n' + "x\n".repeat(30));
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    await rm(root, { recursive: true, force: true });
  });

  const output = (): string => logSpy.mock.calls.map((c) => c.join(" ")).join("\n");

  it("prints loops with evidence and oversized files", async () => {
    const code = await smellsCommand({ _: [root], "max-file-lines": "10" });
    expect(code).toBe(0);
    const out = output();
    expect(out).toContain("FOLDER LOOPS");
    expect(out).toContain("src/a/x.ts");
    expect(out).toContain("OVERSIZED FILES");
    expect(out).toContain("src/b/y.ts");
  });

  it("emits JSON and fails with --fail-on-warn", async () => {
    const code = await smellsCommand({ _: [root], json: "true", "fail-on-warn": "true" });
    expect(code).toBe(1);
    const parsed = JSON.parse(output());
    expect(parsed.ok).toBe(true);
    expect(parsed.summary).toEqual({ folderLoops: 1, oversizedFiles: 0, total: 1 });
  });

  it("returns 2 for a missing directory", async () => {
    const code = await smellsCommand({ _: [path.join(root, "nope")] });
    expect(code).toBe(2);
  });

  describe("baseline", () => {
    it("--update-baseline saves today's findings, then --fail-on-warn passes", async () => {
      expect(await smellsCommand({ _: [root], "update-baseline": "true" })).toBe(0);
      const saved = JSON.parse(await readFile(path.join(root, ".archik/smells-baseline.json"), "utf-8"));
      expect(saved.folderLoops).toEqual([["src/a", "src/b"]]);
      logSpy.mockClear();
      expect(await smellsCommand({ _: [root], "fail-on-warn": "true" })).toBe(0);
      expect(output()).toContain("(baseline)");
      expect(output()).toContain("0 new since");
    });

    it("fails only on a new loop and marks it NEW", async () => {
      await smellsCommand({ _: [root], "update-baseline": "true" });
      await mkdir(path.join(root, "src/c"), { recursive: true });
      await mkdir(path.join(root, "src/d"), { recursive: true });
      await writeFile(path.join(root, "src/c/p.ts"), 'import "../d/q";\n');
      await writeFile(path.join(root, "src/d/q.ts"), 'import "../c/p";\n');
      logSpy.mockClear();
      expect(await smellsCommand({ _: [root], "fail-on-warn": "true", json: "true" })).toBe(1);
      const parsed = JSON.parse(output());
      expect(parsed.baseline.newFolderLoops).toEqual([["src/c", "src/d"]]);
    });

    it("returns 2 when an explicit --baseline file is missing", async () => {
      expect(await smellsCommand({ _: [root], baseline: "nope.json" })).toBe(2);
    });
  });
});
