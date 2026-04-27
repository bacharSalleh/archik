import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { safeResolveProjectFile } from "./handlers.ts";

describe("safeResolveProjectFile", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "archik-sandbox-"));
    await mkdir(path.join(root, ".archik"));
    await writeFile(path.join(root, ".archik", "main.archik.yaml"), "");
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("accepts a relative .archik.yaml under the project root", () => {
    const out = safeResolveProjectFile(root, ".archik/main.archik.yaml");
    expect(out).toBe(path.join(root, ".archik", "main.archik.yaml"));
  });

  it("accepts a .archik.suggested.yaml sibling", () => {
    const out = safeResolveProjectFile(
      root,
      ".archik/main.archik.suggested.yaml",
    );
    expect(out).toBe(
      path.join(root, ".archik", "main.archik.suggested.yaml"),
    );
  });

  it("rejects a path that escapes the root via `..`", () => {
    expect(safeResolveProjectFile(root, "../escape.archik.yaml")).toBeNull();
    expect(
      safeResolveProjectFile(root, ".archik/../../escape.archik.yaml"),
    ).toBeNull();
  });

  it("rejects an absolute path", () => {
    expect(safeResolveProjectFile(root, "/etc/passwd.archik.yaml")).toBeNull();
  });

  it("rejects a Windows drive-letter path", () => {
    expect(safeResolveProjectFile(root, "C:/secrets.archik.yaml")).toBeNull();
  });

  it("rejects a path containing backslashes", () => {
    expect(
      safeResolveProjectFile(root, ".archik\\main.archik.yaml"),
    ).toBeNull();
  });

  it("rejects files with the wrong extension", () => {
    expect(safeResolveProjectFile(root, ".archik/notes.yaml")).toBeNull();
    expect(safeResolveProjectFile(root, ".archik/main.json")).toBeNull();
    expect(safeResolveProjectFile(root, ".archik/main")).toBeNull();
  });

  it("rejects empty / non-string input", () => {
    expect(safeResolveProjectFile(root, "")).toBeNull();
  });

  it("does not require the file to exist (404 is the handler's job)", () => {
    const out = safeResolveProjectFile(
      root,
      ".archik/never-created.archik.yaml",
    );
    expect(out).toBe(
      path.join(root, ".archik", "never-created.archik.yaml"),
    );
  });
});
