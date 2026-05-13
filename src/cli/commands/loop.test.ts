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
  ENGINEERING_LOOP_REFERENCE,
  ensureClaudeMdLink,
  installEngineeringLoop,
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

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), "archik-claudemd-"));
    originalCwd = process.cwd();
    process.chdir(projectRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("creates CLAUDE.md with the @-reference when missing", async () => {
    const result = await ensureClaudeMdLink();
    expect(result.action).toBe("created");
    const content = await readFile(path.join(projectRoot, "CLAUDE.md"), "utf-8");
    expect(content).toContain(ENGINEERING_LOOP_REFERENCE);
  });

  it("appends the section when CLAUDE.md exists without the reference", async () => {
    await writeFile(path.join(projectRoot, "CLAUDE.md"), "# existing\n");
    const result = await ensureClaudeMdLink();
    expect(result.action).toBe("appended");
    const content = await readFile(path.join(projectRoot, "CLAUDE.md"), "utf-8");
    expect(content).toMatch(/^# existing/);
    expect(content).toContain(ENGINEERING_LOOP_REFERENCE);
  });

  it("is a no-op when the reference is already present", async () => {
    const initial =
      `# existing\n\n${ENGINEERING_LOOP_REFERENCE}\n`;
    await writeFile(path.join(projectRoot, "CLAUDE.md"), initial);
    const result = await ensureClaudeMdLink();
    expect(result.action).toBe("already-linked");
    const content = await readFile(path.join(projectRoot, "CLAUDE.md"), "utf-8");
    expect(content).toBe(initial);
  });
});
