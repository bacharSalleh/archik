import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { installCommands, installSkill } from "./skill.ts";

/**
 * `installCommands` mirrors `installSkill` for the `/archik:*` slash
 * commands. We pin: source layout (looks under .claude/commands/archik
 * relative to ARCHIK_PKG_ROOT), copy semantics (every .md file lands
 * in the target dir), refusal-on-collision without --force, and
 * overwrite-on-collision with --force. `installSkill` already has
 * production coverage via init.ts, so we sanity-check it here too.
 */
describe("installCommands", () => {
  let projectRoot: string;
  let pkgRoot: string;
  let originalCwd: string;
  let originalPkgRoot: string | undefined;

  beforeEach(async () => {
    pkgRoot = await mkdtemp(path.join(tmpdir(), "archik-pkg-"));
    projectRoot = await mkdtemp(path.join(tmpdir(), "archik-project-"));

    // Stand up a fake source tree so the installer copies from a
    // tempdir we control rather than the real package root. This
    // also lets us test the "missing source" branch without
    // wrecking the real `commands/` and `skills/archik/` source
    // directories. Layout matches the Claude Code plugin convention
    // (`commands/*.md`, `skills/<name>/SKILL.md`).
    const srcCmd = path.join(pkgRoot, "commands");
    await mkdir(srcCmd, { recursive: true });
    await writeFile(path.join(srcCmd, "suggest.md"), "# suggest stub\n");
    await writeFile(path.join(srcCmd, "accept.md"), "# accept stub\n");
    const srcSkill = path.join(pkgRoot, "skills/archik");
    await mkdir(srcSkill, { recursive: true });
    await writeFile(path.join(srcSkill, "SKILL.md"), "# skill stub\n");

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

  it("copies every command file into project .claude/commands/archik", async () => {
    const result = await installCommands({ scope: "project", force: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.copied.sort()).toEqual(["accept.md", "suggest.md"]);
    const target = path.join(projectRoot, ".claude/commands/archik");
    expect(await readFile(path.join(target, "suggest.md"), "utf-8")).toBe(
      "# suggest stub\n",
    );
    expect(await readFile(path.join(target, "accept.md"), "utf-8")).toBe(
      "# accept stub\n",
    );
  });

  it("refuses without --force when target files already exist", async () => {
    await installCommands({ scope: "project", force: false });
    // Mutate one to confirm it's preserved on the refusal path.
    const target = path.join(projectRoot, ".claude/commands/archik/suggest.md");
    await writeFile(target, "# user edit\n");

    const result = await installCommands({ scope: "project", force: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("exists");
    if (result.reason !== "exists") return;
    expect(result.existing).toContain("suggest.md");
    // File untouched.
    expect(await readFile(target, "utf-8")).toBe("# user edit\n");
  });

  it("overwrites collisions with --force", async () => {
    await installCommands({ scope: "project", force: false });
    const target = path.join(projectRoot, ".claude/commands/archik/suggest.md");
    await writeFile(target, "# user edit\n");

    const result = await installCommands({ scope: "project", force: true });
    expect(result.ok).toBe(true);
    expect(await readFile(target, "utf-8")).toBe("# suggest stub\n");
  });

  it("returns missing-source when there are no command files to install", async () => {
    await rm(path.join(pkgRoot, "commands"), {
      recursive: true,
      force: true,
    });
    const result = await installCommands({ scope: "project", force: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("missing-source");
  });

  it("installs the skill alongside (sanity)", async () => {
    const result = await installSkill({ scope: "project", force: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await stat(result.target); // file must exist
  });
});
