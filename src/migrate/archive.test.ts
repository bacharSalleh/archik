import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { archiveProject } from "./archive.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "archik-arch-"));
  await mkdir(path.join(dir, ".archik/usecases"), { recursive: true });
  await writeFile(path.join(dir, ".archik/main.archik.yaml"), "MAIN");
  await writeFile(path.join(dir, ".archik/usecases/a.archik.uc.yaml"), "UC");
  await writeFile(path.join(dir, "architecture.archik.yaml"), "LEGACY");
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("archiveProject", () => {
  it("copies .archik + legacy file to a sibling .archik.archive/<ts>/", async () => {
    const archiveDir = archiveProject(dir);
    expect(archiveDir.includes(path.join(dir, ".archik.archive"))).toBe(true);
    expect(await readFile(path.join(archiveDir, ".archik/main.archik.yaml"), "utf-8")).toBe("MAIN");
    expect(await readFile(path.join(archiveDir, ".archik/usecases/a.archik.uc.yaml"), "utf-8")).toBe("UC");
    expect(await readFile(path.join(archiveDir, "architecture.archik.yaml"), "utf-8")).toBe("LEGACY");
  });
  it("leaves the originals in place", () => {
    archiveProject(dir);
    expect(existsSync(path.join(dir, ".archik/main.archik.yaml"))).toBe(true);
    expect(existsSync(path.join(dir, "architecture.archik.yaml"))).toBe(true);
  });
  it("the archive is NOT inside .archik (discovery would otherwise pick it up)", () => {
    const archiveDir = archiveProject(dir);
    expect(archiveDir.includes(path.join(dir, ".archik", ".archik.archive"))).toBe(false);
    expect(archiveDir.startsWith(path.join(dir, ".archik.archive"))).toBe(true);
  });
});
