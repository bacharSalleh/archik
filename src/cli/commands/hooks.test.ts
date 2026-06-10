import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hooksCommand } from "./hooks.ts";

describe("hooksCommand", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  const gitIn = (...args: string[]): void => {
    const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
    }
  };

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-hooks-"));
    originalCwd = process.cwd();
    process.chdir(cwd);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    logSpy.mockRestore();
    errSpy.mockRestore();
    await rm(cwd, { recursive: true, force: true });
  });

  it("installs an executable pre-commit hook", async () => {
    gitIn("init", "-q");
    const code = await hooksCommand({ _: ["install"] });
    expect(code).toBe(0);
    const hookPath = path.join(cwd, ".git/hooks/pre-commit");
    const content = await readFile(hookPath, "utf-8");
    expect(content).toContain("archik validate");
    expect(content).not.toContain("archik drift");
    const mode = (await stat(hookPath)).mode & 0o111;
    expect(mode).not.toBe(0);
  });

  it("adds the drift gate with --with-drift", async () => {
    gitIn("init", "-q");
    const code = await hooksCommand({ _: ["install"], "with-drift": "true" });
    expect(code).toBe(0);
    const content = await readFile(
      path.join(cwd, ".git/hooks/pre-commit"),
      "utf-8",
    );
    expect(content).toContain("archik drift");
  });

  it("is idempotent over its own hook", async () => {
    gitIn("init", "-q");
    expect(await hooksCommand({ _: ["install"] })).toBe(0);
    expect(await hooksCommand({ _: ["install"] })).toBe(0);
  });

  it("refuses to clobber a foreign hook without --force", async () => {
    gitIn("init", "-q");
    const hookPath = path.join(cwd, ".git/hooks/pre-commit");
    await writeFile(hookPath, "#!/bin/sh\necho mine\n");
    expect(await hooksCommand({ _: ["install"] })).toBe(1);
    expect(await readFile(hookPath, "utf-8")).toContain("echo mine");
    expect(await hooksCommand({ _: ["install"], force: "true" })).toBe(0);
    expect(await readFile(hookPath, "utf-8")).toContain("archik validate");
  });

  it("respects core.hooksPath", async () => {
    gitIn("init", "-q");
    gitIn("config", "core.hooksPath", ".husky");
    await rm(path.join(cwd, ".husky"), { recursive: true, force: true });
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.join(cwd, ".husky"), { recursive: true });
    expect(await hooksCommand({ _: ["install"] })).toBe(0);
    const content = await readFile(path.join(cwd, ".husky/pre-commit"), "utf-8");
    expect(content).toContain("archik validate");
  });

  it("uninstalls only its own hook", async () => {
    gitIn("init", "-q");
    await hooksCommand({ _: ["install"] });
    expect(await hooksCommand({ _: ["uninstall"] })).toBe(0);
    expect(
      await readFile(path.join(cwd, ".git/hooks/pre-commit"), "utf-8").catch(
        () => null,
      ),
    ).toBeNull();

    const hookPath = path.join(cwd, ".git/hooks/pre-commit");
    await writeFile(hookPath, "#!/bin/sh\necho mine\n");
    expect(await hooksCommand({ _: ["uninstall"] })).toBe(1);
    expect(await readFile(hookPath, "utf-8")).toContain("echo mine");
  });

  it("fails outside a git repository", async () => {
    expect(await hooksCommand({ _: ["install"] })).toBe(1);
  });

  it("rejects unknown subcommands", async () => {
    expect(await hooksCommand({ _: [] })).toBe(2);
  });
});
