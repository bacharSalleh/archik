import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
});
