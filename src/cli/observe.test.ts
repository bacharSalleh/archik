import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readEvents,
  setEvolutionEnabled,
} from "../io/evolution-log.ts";
import { UNOBSERVED, flagNames, recordRun } from "./observe.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "archik-observe-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = {
  command: "validate",
  sub: undefined,
  flags: ["json"],
  exitCode: 0,
  durationMs: 10,
  ts: "2026-06-10T12:00:00.000Z",
};

describe("recordRun", () => {
  it("does nothing when observation is disabled", async () => {
    await recordRun(root, run);
    expect(existsSync(path.join(root, ".archik", "evolution", "events.jsonl"))).toBe(false);
  });

  it("appends events when enabled", async () => {
    await setEvolutionEnabled(root, true);
    await recordRun(root, run);
    const { events } = await readEvents(root);
    expect(events.map((e) => e.type)).toEqual(["command", "validate_result"]);
  });

  it("never throws, even when the root is not writable", async () => {
    const file = path.join(root, "a-file");
    await writeFile(file, "not a dir", "utf-8");
    await expect(recordRun(file, run)).resolves.toBeUndefined();
  });
});

describe("flagNames", () => {
  it("keeps flag names and drops values and positionals", () => {
    expect(
      flagNames(["list", "--kind", "service", "--json", "--out=x.svg"]),
    ).toEqual(["kind", "json", "out"]);
  });
});

describe("UNOBSERVED", () => {
  it("excludes long-running and self-referential commands", () => {
    for (const c of ["mcp", "dev", "start", "watch", "evolution"]) {
      expect(UNOBSERVED.has(c)).toBe(true);
    }
    expect(UNOBSERVED.has("validate")).toBe(false);
  });
});
