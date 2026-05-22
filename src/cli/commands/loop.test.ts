import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  CLAUDE_BLOCK_START,
  ENGINEERING_LOOP_REFERENCE,
  PRINCIPLES_REFERENCE,
  ensureClaudeMdLink,
  installEngineeringLoop,
  installPrinciples,
  installSuperpowersOverlay,
} from "./skill.ts";

/**
 * Engineering-loop install + CLAUDE.md linker. Three branches per
 * helper:
 *
 *   installEngineeringLoop:
 *     - copies docs/templates/CLAUDE.md → .archik/ENGINEERING_LOOP.md
 *     - refuses without --force on collision
 *     - overwrites with --force
 *
 *   ensureClaudeMdLink:
 *     - creates CLAUDE.md when missing
 *     - appends a section when the reference is absent
 *     - no-ops when the reference is already there
 */
describe("installEngineeringLoop", () => {
  let projectRoot: string;
  let pkgRoot: string;
  let originalCwd: string;
  let originalPkgRoot: string | undefined;

  beforeEach(async () => {
    pkgRoot = await mkdtemp(path.join(tmpdir(), "archik-pkg-"));
    projectRoot = await mkdtemp(path.join(tmpdir(), "archik-project-"));

    const tplDir = path.join(pkgRoot, "docs/templates");
    await mkdir(tplDir, { recursive: true });
    await writeFile(path.join(tplDir, "CLAUDE.md"), "# loop stub\n");

    originalCwd = process.cwd();
    process.chdir(projectRoot);
    originalPkgRoot = process.env["ARCHIK_PKG_ROOT"];
    process.env["ARCHIK_PKG_ROOT"] = pkgRoot;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalPkgRoot === undefined) delete process.env["ARCHIK_PKG_ROOT"];
    else process.env["ARCHIK_PKG_ROOT"] = originalPkgRoot;
    await rm(pkgRoot, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("copies the template into .archik/ENGINEERING_LOOP.md", async () => {
    const result = await installEngineeringLoop({ force: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // macOS realpath prefixes tempdirs with /private — match by suffix
    // rather than absolute path so the test is platform-agnostic.
    expect(result.target.endsWith(path.join(".archik", "ENGINEERING_LOOP.md"))).toBe(true);
    expect(await readFile(result.target, "utf-8")).toBe("# loop stub\n");
  });

  it("refuses without --force when the loop file already exists", async () => {
    await installEngineeringLoop({ force: false });
    const target = path.join(projectRoot, ".archik/ENGINEERING_LOOP.md");
    await writeFile(target, "# user edit\n");

    const result = await installEngineeringLoop({ force: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("exists");
    expect(await readFile(target, "utf-8")).toBe("# user edit\n");
  });

  it("overwrites the existing loop file with --force", async () => {
    await installEngineeringLoop({ force: false });
    const target = path.join(projectRoot, ".archik/ENGINEERING_LOOP.md");
    await writeFile(target, "# user edit\n");

    const result = await installEngineeringLoop({ force: true });
    expect(result.ok).toBe(true);
    expect(await readFile(target, "utf-8")).toBe("# loop stub\n");
  });

  it("returns missing-source when the template is not bundled", async () => {
    await rm(path.join(pkgRoot, "docs/templates/CLAUDE.md"), { force: true });
    const result = await installEngineeringLoop({ force: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("missing-source");
  });
});

describe("ensureClaudeMdLink", () => {
  let projectRoot: string;
  let originalCwd: string;
  const refs = [ENGINEERING_LOOP_REFERENCE, PRINCIPLES_REFERENCE];

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), "archik-claudemd-"));
    originalCwd = process.cwd();
    process.chdir(projectRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(projectRoot, { recursive: true, force: true });
  });

  const read = () => readFile(path.join(projectRoot, "CLAUDE.md"), "utf-8");

  it("creates CLAUDE.md with the managed block and all refs when missing", async () => {
    const result = await ensureClaudeMdLink({ mode: "append", refs });
    expect(result.action).toBe("created");
    const content = await read();
    expect(content).toContain(CLAUDE_BLOCK_START);
    expect(content).toContain(ENGINEERING_LOOP_REFERENCE);
    expect(content).toContain(PRINCIPLES_REFERENCE);
    expect(content).toMatch(/Follow the archik engineering loop/i);
  });

  it("append preserves the user's existing prose", async () => {
    await writeFile(path.join(projectRoot, "CLAUDE.md"), "# existing\n\nmy notes\n");
    const result = await ensureClaudeMdLink({ mode: "append", refs });
    expect(result.action).toBe("appended");
    const content = await read();
    expect(content).toMatch(/^# existing/);
    expect(content).toContain("my notes");
    expect(content).toContain(CLAUDE_BLOCK_START);
  });

  it("append is idempotent — re-running regenerates the marked region, no dupes", async () => {
    await writeFile(path.join(projectRoot, "CLAUDE.md"), "# existing\n");
    await ensureClaudeMdLink({ mode: "append", refs });
    const result = await ensureClaudeMdLink({ mode: "append", refs });
    expect(result.action).toBe("updated");
    const content = await read();
    const starts = content.split(CLAUDE_BLOCK_START).length - 1;
    expect(starts).toBe(1);
  });

  it("overwrite replaces the whole file with the managed block", async () => {
    await writeFile(path.join(projectRoot, "CLAUDE.md"), "# old stuff\n\nkeep? no\n");
    const result = await ensureClaudeMdLink({ mode: "overwrite", refs });
    expect(result.action).toBe("overwritten");
    const content = await read();
    expect(content).not.toContain("old stuff");
    expect(content).toContain(ENGINEERING_LOOP_REFERENCE);
  });
});

describe("installPrinciples / installSuperpowersOverlay", () => {
  let projectRoot: string;
  let pkgRoot: string;
  let originalCwd: string;
  let originalPkgRoot: string | undefined;

  beforeEach(async () => {
    pkgRoot = await mkdtemp(path.join(tmpdir(), "archik-pkg-"));
    projectRoot = await mkdtemp(path.join(tmpdir(), "archik-project-"));

    const principlesDir = path.join(pkgRoot, "docs/templates/principles");
    await mkdir(principlesDir, { recursive: true });
    await writeFile(path.join(principlesDir, "oop.md"), "# oop stub\n");
    await writeFile(path.join(principlesDir, "functional.md"), "# fp stub\n");
    await writeFile(
      path.join(pkgRoot, "docs/templates/superpowers.md"),
      "# sp stub\n",
    );

    originalCwd = process.cwd();
    process.chdir(projectRoot);
    originalPkgRoot = process.env["ARCHIK_PKG_ROOT"];
    process.env["ARCHIK_PKG_ROOT"] = pkgRoot;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalPkgRoot === undefined) delete process.env["ARCHIK_PKG_ROOT"];
    else process.env["ARCHIK_PKG_ROOT"] = originalPkgRoot;
    await rm(pkgRoot, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("copies the chosen paradigm into .archik/PRINCIPLES.md", async () => {
    const result = await installPrinciples({ paradigm: "functional", force: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await readFile(result.target, "utf-8")).toBe("# fp stub\n");
  });

  it("refuses to overwrite PRINCIPLES.md without --force", async () => {
    await installPrinciples({ paradigm: "oop", force: false });
    const result = await installPrinciples({ paradigm: "functional", force: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("exists");
  });

  it("copies the superpowers overlay into .archik/SUPERPOWERS.md", async () => {
    const result = await installSuperpowersOverlay({ force: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await readFile(result.target, "utf-8")).toBe("# sp stub\n");
  });
});
