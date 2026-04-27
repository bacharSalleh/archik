import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listArchikFiles, safeResolveProjectFile } from "./handlers.ts";

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

describe("listArchikFiles", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "archik-list-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("finds files under .archik/ and the legacy root file", async () => {
    await writeFile(path.join(root, "architecture.archik.yaml"), "");
    await mkdir(path.join(root, ".archik"));
    await writeFile(path.join(root, ".archik", "orders.archik.yaml"), "");
    await writeFile(path.join(root, ".archik", "payments.archik.yaml"), "");
    const files = await listArchikFiles(root);
    expect(files.map((f) => f.path)).toEqual([
      "architecture.archik.yaml",
      ".archik/orders.archik.yaml",
      ".archik/payments.archik.yaml",
    ]);
  });

  it("flags files that have a pending suggestion sidecar", async () => {
    await mkdir(path.join(root, ".archik"));
    await writeFile(path.join(root, ".archik", "main.archik.yaml"), "");
    await writeFile(
      path.join(root, ".archik", "orders.archik.yaml"),
      "",
    );
    await writeFile(
      path.join(root, ".archik", "orders.archik.suggested.yaml"),
      "",
    );
    const files = await listArchikFiles(root);
    const main = files.find((f) => f.path === ".archik/main.archik.yaml");
    const orders = files.find((f) => f.path === ".archik/orders.archik.yaml");
    expect(main?.hasSuggestion).toBe(false);
    expect(orders?.hasSuggestion).toBe(true);
  });

  it("renames the legacy `architecture` file to display name 'main'", async () => {
    await writeFile(path.join(root, "architecture.archik.yaml"), "");
    const files = await listArchikFiles(root);
    expect(files[0]?.name).toBe("main");
  });

  it("flags `isRoot` on the file the resolver picked", async () => {
    await mkdir(path.join(root, ".archik"));
    const main = path.join(root, ".archik", "main.archik.yaml");
    const orders = path.join(root, ".archik", "orders.archik.yaml");
    await writeFile(main, "");
    await writeFile(orders, "");
    const files = await listArchikFiles(root, main);
    expect(files.find((f) => f.path === ".archik/main.archik.yaml")?.isRoot).toBe(
      true,
    );
    expect(
      files.find((f) => f.path === ".archik/orders.archik.yaml")?.isRoot,
    ).toBe(false);
  });

  it("skips node_modules, dist, and other ignored directories", async () => {
    await mkdir(path.join(root, "node_modules", "archik", ".archik"), {
      recursive: true,
    });
    await writeFile(
      path.join(
        root,
        "node_modules",
        "archik",
        ".archik",
        "main.archik.yaml",
      ),
      "",
    );
    await mkdir(path.join(root, ".archik"));
    await writeFile(path.join(root, ".archik", "main.archik.yaml"), "");
    const files = await listArchikFiles(root);
    expect(files.map((f) => f.path)).toEqual([".archik/main.archik.yaml"]);
  });

  it("ignores .suggested files (they're sidecars, not docs)", async () => {
    await mkdir(path.join(root, ".archik"));
    await writeFile(path.join(root, ".archik", "main.archik.yaml"), "");
    await writeFile(
      path.join(root, ".archik", "main.archik.suggested.yaml"),
      "",
    );
    const files = await listArchikFiles(root);
    expect(files.map((f) => f.path)).toEqual([".archik/main.archik.yaml"]);
  });
});
