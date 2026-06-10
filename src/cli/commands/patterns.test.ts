import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listPatterns, patternsCommand } from "./patterns.ts";
import type { ParsedOptions } from "../options.ts";

let root: string;
let mainPath: string;

const MAIN_YAML = `version: "1.0"
name: Test
nodes:
  - id: api
    kind: service
    name: API
    description: REST API serving the frontend.
    sourcePath: src
edges: []
`;

let logs: string[];

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "archik-patterns-"));
  await mkdir(path.join(root, ".archik"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  mainPath = path.join(root, ".archik", "main.archik.yaml");
  await writeFile(mainPath, MAIN_YAML, "utf-8");
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logs.push(args.join(" "));
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

const run = (...args: string[]): Promise<number> => {
  const opts: ParsedOptions = { _: args, doc: mainPath };
  return patternsCommand(opts);
};

describe("listPatterns", () => {
  it("finds the five seed patterns", async () => {
    const ids = (await listPatterns()).map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "evolution-loop",
        "sidecar-approval-gate",
        "learned-overlay",
        "truth-chain",
        "feedback-pipeline",
      ]),
    );
  });

  it("every pattern has an intent line", async () => {
    for (const p of await listPatterns()) {
      expect(p.intent.length, p.id).toBeGreaterThan(10);
    }
  });
});

describe("patterns CLI", () => {
  it("list exits 0", async () => {
    expect(await run("list")).toBe(0);
    expect(logs.join("\n")).toContain("evolution-loop");
  });

  it("show prints the pattern doc", async () => {
    expect(await run("show", "learned-overlay")).toBe(0);
    expect(logs.join("\n")).toContain("Learned Overlay");
  });

  it("show of an unknown id exits 2", async () => {
    expect(await run("show", "nope")).toBe(2);
  });

  it("apply evolution-loop stages a sidecar with the blueprint nodes", async () => {
    expect(await run("apply", "evolution-loop")).toBe(0);
    const sidecar = path.join(root, ".archik", "main.archik.suggested.yaml");
    expect(existsSync(sidecar)).toBe(true);
    const text = await readFile(sidecar, "utf-8");
    expect(text).toContain("evo-event-log");
    expect(text).toContain("api"); // existing nodes preserved
  });

  it("apply refuses when a sidecar is already pending", async () => {
    await writeFile(
      path.join(root, ".archik", "main.archik.suggested.yaml"),
      MAIN_YAML,
      "utf-8",
    );
    expect(await run("apply", "evolution-loop")).toBe(1);
  });

  it("apply of a doc-only pattern explains itself", async () => {
    expect(await run("apply", "truth-chain")).toBe(1);
    expect(logs.join("\n")).toContain("no blueprint");
  });

  it("apply twice would collide — refused via pending sidecar or id check", async () => {
    expect(await run("apply", "evolution-loop")).toBe(0);
    expect(await run("apply", "evolution-loop")).toBe(1);
  });
});
