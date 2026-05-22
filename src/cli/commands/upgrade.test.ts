import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { upgradeCommand } from "./upgrade.ts";
import { CLAUDE_BLOCK_END, CLAUDE_BLOCK_START } from "./skill.ts";

// Mock the interactive prompt module so we can drive upgrade's TTY branch
// deterministically. `interactive` gates whether prompts fire; `select`
// returns canned answers in call order.
const prompt = vi.hoisted(() => ({
  interactive: false,
  select: vi.fn(),
}));
vi.mock("../prompts.ts", () => ({
  isInteractive: () => prompt.interactive,
  selectFromList: prompt.select,
}));

/**
 * Pins the `npx archik@latest upgrade` story for a project that does NOT
 * depend on archik (no node_modules/.bin/archik), refreshing IN-PROCESS
 * from a fake "latest" pkgRoot. Also covers the upgrade-time CLAUDE.md /
 * paradigm / superpowers behavior: refresh-only when non-interactive,
 * offer-the-missing-pieces when interactive.
 *
 * `--skip-install` jumps straight to the refresh step (no npm, no registry).
 */
describe("upgradeCommand — refresh + setup", () => {
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
      path.join(pkgRoot, "docs/templates/principles/functional.md"),
      "<!-- archik:principles:functional -->\nNEW fp\n",
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
    prompt.interactive = false;
    prompt.select.mockReset();
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
  const bare = async () => {
    await rm(path.join(project, ".archik/PRINCIPLES.md"), { force: true });
    await rm(path.join(project, ".archik/SUPERPOWERS.md"), { force: true });
  };

  // ── Pure refresh ─────────────────────────────────────────────────
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
    await bare();
    await upgradeCommand({ _: [], "skip-install": "true" });
    await expect(read(".archik/PRINCIPLES.md")).rejects.toThrow();
    await expect(read(".archik/SUPERPOWERS.md")).rejects.toThrow();
    expect(await read(".archik/ENGINEERING_LOOP.md")).toBe("NEW loop\n");
  });

  // ── CLAUDE.md: non-interactive = refresh-only, never silently add ─
  it("does not create CLAUDE.md non-interactively when it isn't wired", async () => {
    await upgradeCommand({ _: [], "skip-install": "true" });
    await expect(read("CLAUDE.md")).rejects.toThrow();
  });

  it("leaves an unwired CLAUDE.md untouched non-interactively", async () => {
    await writeFile(path.join(project, "CLAUDE.md"), "# mine\n\nrules\n");
    await upgradeCommand({ _: [], "skip-install": "true" });
    expect(await read("CLAUDE.md")).toBe("# mine\n\nrules\n");
  });

  it("refreshes an existing archik block in place (prose preserved)", async () => {
    const old = `# mine\n\n${CLAUDE_BLOCK_START}\nOLD directive\n@.archik/ENGINEERING_LOOP.md\n${CLAUDE_BLOCK_END}\n`;
    await writeFile(path.join(project, "CLAUDE.md"), old);
    await upgradeCommand({ _: [], "skip-install": "true" });
    const claude = await read("CLAUDE.md");
    expect(claude).toContain("# mine");
    expect(claude).toMatch(/Follow the archik engineering loop/i);
    expect(claude).toContain("@.archik/PRINCIPLES.md");
    expect(claude).toContain("@.archik/SUPERPOWERS.md");
    expect(claude).not.toContain("OLD directive");
  });

  it("--no-claude-md skips even an existing-block refresh", async () => {
    const withBlock = `# mine\n${CLAUDE_BLOCK_START}\nOLD\n${CLAUDE_BLOCK_END}\n`;
    await writeFile(path.join(project, "CLAUDE.md"), withBlock);
    await upgradeCommand({ _: [], "skip-install": "true", "no-claude-md": "true" });
    expect(await read("CLAUDE.md")).toBe(withBlock);
  });

  // ── Interactive: offer the missing pieces ────────────────────────
  it("offers and adds paradigm + superpowers + CLAUDE.md when interactive", async () => {
    await bare();
    prompt.interactive = true;
    prompt.select
      .mockResolvedValueOnce("functional") // paradigm
      .mockResolvedValueOnce(true) // superpowers
      .mockResolvedValueOnce(true); // wire CLAUDE.md
    await upgradeCommand({ _: [], "skip-install": "true" });
    expect(await read(".archik/PRINCIPLES.md")).toBe(
      "<!-- archik:principles:functional -->\nNEW fp\n",
    );
    expect(await read(".archik/SUPERPOWERS.md")).toBe("NEW overlay\n");
    const claude = await read("CLAUDE.md");
    expect(claude).toContain("@.archik/ENGINEERING_LOOP.md");
    expect(claude).toContain("@.archik/PRINCIPLES.md");
    expect(claude).toContain("@.archik/SUPERPOWERS.md");
  });

  it("respects 'No' answers when interactive", async () => {
    await bare();
    prompt.interactive = true;
    prompt.select
      .mockResolvedValueOnce("none") // paradigm: skip
      .mockResolvedValueOnce(false) // superpowers: no
      .mockResolvedValueOnce(false); // CLAUDE.md: no
    await upgradeCommand({ _: [], "skip-install": "true" });
    await expect(read(".archik/PRINCIPLES.md")).rejects.toThrow();
    await expect(read(".archik/SUPERPOWERS.md")).rejects.toThrow();
    await expect(read("CLAUDE.md")).rejects.toThrow();
  });
});
