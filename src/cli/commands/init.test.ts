import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initCommand } from "./init.ts";

// Repo root resolved from this file's location (src/cli/commands → three levels up).
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("initCommand", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-init-"));
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

  it("creates .archik/main.archik.yaml in a fresh directory", async () => {
    const code = await initCommand({ _: [], "no-skill": "true", "no-commands": "true" });
    expect(code).toBe(0);
    const content = await readFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      "utf-8",
    );
    expect(content).toContain('version: "1.0"');
    expect(content).toContain("nodes:");
  });

  it("logs a success message after creating the file", async () => {
    await initCommand({ _: [], "no-skill": "true", "no-commands": "true" });
    const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toMatch(/created/i);
    expect(out).toContain("main.archik.yaml");
  });

  it("returns 1 and refuses to overwrite an existing file", async () => {
    await mkdir(path.join(cwd, ".archik"), { recursive: true });
    await writeFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      "existing content",
    );
    const code = await initCommand({ _: [], "no-skill": "true", "no-commands": "true" });
    expect(code).toBe(1);
    const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(err).toMatch(/already exists/i);
    // Existing file must not be overwritten
    const content = await readFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      "utf-8",
    );
    expect(content).toBe("existing content");
  });

  it("creates the .archik directory if it doesn't exist", async () => {
    const code = await initCommand({ _: [], "no-skill": "true", "no-commands": "true" });
    expect(code).toBe(0);
    const stat = await import("node:fs/promises").then((m) =>
      m.stat(path.join(cwd, ".archik")),
    );
    expect(stat.isDirectory()).toBe(true);
  });

  it("appends .archik/runtime.json to .gitignore when one exists", async () => {
    await writeFile(path.join(cwd, ".gitignore"), "node_modules\n");
    await initCommand({ _: [], "no-skill": "true", "no-commands": "true" });
    const gitignore = await readFile(path.join(cwd, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".archik/runtime.json");
  });

  it("does not modify .gitignore when the entry is already present", async () => {
    await writeFile(
      path.join(cwd, ".gitignore"),
      "node_modules\n.archik/runtime.json\n",
    );
    await initCommand({ _: [], "no-skill": "true", "no-commands": "true" });
    const gitignore = await readFile(path.join(cwd, ".gitignore"), "utf-8");
    const count = (gitignore.match(/\.archik\/runtime\.json/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("accepts an explicit output path as the first positional", async () => {
    const target = path.join(cwd, "custom.archik.yaml");
    const code = await initCommand({
      _: [target],
      "no-skill": "true",
      "no-commands": "true",
    });
    expect(code).toBe(0);
    const content = await readFile(target, "utf-8");
    expect(content).toContain('version: "1.0"');
  });

  it("copies CLAUDE.md template when none exists in the target dir", async () => {
    process.env["ARCHIK_PKG_ROOT"] = REPO_ROOT;
    try {
      await initCommand({ _: [], "no-skill": "true", "no-commands": "true" });
    } finally {
      delete process.env["ARCHIK_PKG_ROOT"];
    }
    const content = await readFile(path.join(cwd, "CLAUDE.md"), "utf-8");
    expect(content).toContain("archik q sequences");
  });

  it("prints merge note when CLAUDE.md already exists", async () => {
    process.env["ARCHIK_PKG_ROOT"] = REPO_ROOT;
    await writeFile(path.join(cwd, "CLAUDE.md"), "existing content");
    try {
      await initCommand({ _: [], "no-skill": "true", "no-commands": "true" });
    } finally {
      delete process.env["ARCHIK_PKG_ROOT"];
    }
    // File must not be overwritten
    const content = await readFile(path.join(cwd, "CLAUDE.md"), "utf-8");
    expect(content).toBe("existing content");
    // Log must mention the merge note
    const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toMatch(/already present/i);
  });
});
