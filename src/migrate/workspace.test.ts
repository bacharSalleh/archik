import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWorkspace } from "./workspace.ts";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "archik-ws-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("Workspace", () => {
  it("exists / read / write (creating parent dirs)", () => {
    const ws = createWorkspace(dir);
    expect(ws.exists(".archik/main.archik.yaml")).toBe(false);
    ws.write(".archik/main.archik.yaml", "hello");
    expect(ws.exists(".archik/main.archik.yaml")).toBe(true);
    expect(ws.read(".archik/main.archik.yaml")).toBe("hello");
  });
  it("move relocates a file, creating the target dir", async () => {
    await writeFile(path.join(dir, "architecture.archik.yaml"), "x");
    const ws = createWorkspace(dir);
    ws.move("architecture.archik.yaml", ".archik/main.archik.yaml");
    expect(ws.exists("architecture.archik.yaml")).toBe(false);
    expect(ws.read(".archik/main.archik.yaml")).toBe("x");
  });
  it("list returns [] for an absent dir and filenames otherwise", async () => {
    const ws = createWorkspace(dir);
    expect(ws.list(".archik/usecases")).toEqual([]);
    await mkdir(path.join(dir, ".archik/usecases"), { recursive: true });
    await writeFile(path.join(dir, ".archik/usecases/a.archik.uc.yaml"), "y");
    expect(ws.list(".archik/usecases")).toEqual(["a.archik.uc.yaml"]);
  });
});
