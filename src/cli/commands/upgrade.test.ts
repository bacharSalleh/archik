import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { upgradeCommand } from "./upgrade.ts";

/**
 * Pins the `npx archik@latest upgrade` story for a project that does NOT
 * depend on archik (no node_modules/.bin/archik). The old code shelled out
 * to a bare `npx archik`, which could resolve to a stale global install and
 * silently copy old templates. The fix refreshes IN-PROCESS from the running
 * version's pkgRoot. We stand up a fake pkgRoot with "new" templates and
 * assert the project's stale .archik files are overwritten with them.
 *
 * `--skip-install` jumps straight to the refresh step (no npm, no registry).
 */
describe("upgradeCommand — in-process refresh (no local install)", () => {
  let pkgRoot: string;
  let project: string;
  let originalCwd: string;
  let originalPkgRoot: string | undefined;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    pkgRoot = await mkdtemp(path.join(tmpdir(), "archik-pkg-"));
    project = await mkdtemp(path.join(tmpdir(), "archik-project-"));

    // Fake "latest" package source.
    await writeFile(
      path.join(pkgRoot, "package.json"),
      JSON.stringify({ version: "9.9.9" }),
    );
    await mkdir(path.join(pkgRoot, "skills/archik"), { recursive: true });
    await writeFile(path.join(pkgRoot, "skills/archik/SKILL.md"), "NEW skill\n");
    await mkdir(path.join(pkgRoot, "commands"), { recursive: true });
    await writeFile(path.join(pkgRoot, "commands/suggest.md"), "NEW cmd\n");
    await mkdir(path.join(pkgRoot, "docs/templates/principles"), { recursive: true });
    await writeFile(path.join(pkgRoot, "docs/templates/CLAUDE.md"), "NEW loop\n");
    await writeFile(
      path.join(pkgRoot, "docs/templates/principles/oop.md"),
      "<!-- archik:principles:oop -->\nNEW oop\n",
    );
    await writeFile(
      path.join(pkgRoot, "docs/templates/superpowers.md"),
      "NEW overlay\n",
    );

    // Project with STALE, already-installed loop artifacts and no archik dep.
    await mkdir(path.join(project, ".archik"), { recursive: true });
    await writeFile(path.join(project, ".archik/ENGINEERING_LOOP.md"), "OLD loop\n");
    await writeFile(
      path.join(project, ".archik/PRINCIPLES.md"),
      "<!-- archik:principles:oop -->\nOLD oop\n",
    );
    await writeFile(path.join(project, ".archik/SUPERPOWERS.md"), "OLD overlay\n");

    originalCwd = process.cwd();
    process.chdir(project);
    originalPkgRoot = process.env["ARCHIK_PKG_ROOT"];
    process.env["ARCHIK_PKG_ROOT"] = pkgRoot;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalPkgRoot === undefined) delete process.env["ARCHIK_PKG_ROOT"];
    else process.env["ARCHIK_PKG_ROOT"] = originalPkgRoot;
    logSpy.mockRestore();
    errSpy.mockRestore();
    await rm(pkgRoot, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  });

  const read = (rel: string) => readFile(path.join(project, rel), "utf-8");

  it("overwrites stale loop, principles, and overlay from the running version", async () => {
    const code = await upgradeCommand({ _: [], "skip-install": "true" });
    expect(code).toBe(0);
    expect(await read(".archik/ENGINEERING_LOOP.md")).toBe("NEW loop\n");
    expect(await read(".archik/PRINCIPLES.md")).toBe(
      "<!-- archik:principles:oop -->\nNEW oop\n",
    );
    expect(await read(".archik/SUPERPOWERS.md")).toBe("NEW overlay\n");
  });

  it("refreshes the skill and slash commands too", async () => {
    await upgradeCommand({ _: [], "skip-install": "true" });
    expect(await read(".claude/skills/archik/SKILL.md")).toBe("NEW skill\n");
    expect(await read(".claude/commands/archik/suggest.md")).toBe("NEW cmd\n");
  });

  it("does not create principles/overlay the project never had", async () => {
    await rm(path.join(project, ".archik/PRINCIPLES.md"), { force: true });
    await rm(path.join(project, ".archik/SUPERPOWERS.md"), { force: true });
    await upgradeCommand({ _: [], "skip-install": "true" });
    await expect(read(".archik/PRINCIPLES.md")).rejects.toThrow();
    await expect(read(".archik/SUPERPOWERS.md")).rejects.toThrow();
    // loop is unconditional, so it still refreshes
    expect(await read(".archik/ENGINEERING_LOOP.md")).toBe("NEW loop\n");
  });
});
