import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readStamp, writeStamp } from "./version-stamp.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "archik-stamp-"));
  await mkdir(path.join(dir, ".archik"), { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("version stamp", () => {
  it("returns level 0 when absent", () => {
    expect(readStamp(dir)).toEqual({ archikVersion: "unknown", migrationLevel: 0 });
  });
  it("round-trips a written stamp", () => {
    writeStamp(dir, { archikVersion: "0.16.1", migrationLevel: 2 });
    expect(readStamp(dir)).toEqual({ archikVersion: "0.16.1", migrationLevel: 2 });
  });
  it("returns level 0 on a corrupt file", async () => {
    await writeFile(path.join(dir, ".archik/.version"), "{ not json", "utf-8");
    expect(readStamp(dir).migrationLevel).toBe(0);
  });
  it("creates .archik if missing when writing", async () => {
    const fresh = await mkdtemp(path.join(tmpdir(), "archik-stamp2-"));
    writeStamp(fresh, { archikVersion: "0.16.1", migrationLevel: 1 });
    expect(readStamp(fresh).migrationLevel).toBe(1);
    await rm(fresh, { recursive: true, force: true });
  });
});
