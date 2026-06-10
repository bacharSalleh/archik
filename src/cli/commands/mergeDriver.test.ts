import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import YAML from "yaml";
import { mergeDriverCommand } from "./mergeDriver.ts";

const docYaml = (nodes: string[], edges: string[] = []): string =>
  [
    'version: "1.0"',
    "name: Demo",
    "nodes:",
    ...nodes,
    edges.length > 0 ? "edges:" : "edges: []",
    ...edges,
    "",
  ].join("\n");

const nodeYaml = (id: string, description = "x"): string[] => [
  `  - id: ${id}`,
  "    kind: external",
  `    name: ${id.toUpperCase()}`,
  `    description: ${description}`,
];

describe("mergeDriverCommand", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-merge-"));
    originalCwd = process.cwd();
    process.chdir(cwd);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    logSpy.mockRestore();
    errSpy.mockRestore();
    await rm(cwd, { recursive: true, force: true });
  });

  const writeSides = async (
    base: string,
    ours: string,
    theirs: string,
  ): Promise<{ basePath: string; oursPath: string; theirsPath: string }> => {
    const basePath = path.join(cwd, "base.yaml");
    const oursPath = path.join(cwd, "ours.yaml");
    const theirsPath = path.join(cwd, "theirs.yaml");
    await writeFile(basePath, base);
    await writeFile(oursPath, ours);
    await writeFile(theirsPath, theirs);
    return { basePath, oursPath, theirsPath };
  };

  it("merges non-overlapping additions cleanly and writes to ours", async () => {
    const { basePath, oursPath, theirsPath } = await writeSides(
      docYaml(nodeYaml("api")),
      docYaml([...nodeYaml("api"), ...nodeYaml("worker")]),
      docYaml([...nodeYaml("api"), ...nodeYaml("db")]),
    );
    const code = await mergeDriverCommand({
      _: [basePath, oursPath, theirsPath],
    });
    expect(code).toBe(0);
    const merged = YAML.parse(await readFile(oursPath, "utf-8"));
    expect(merged.nodes.map((n: { id: string }) => n.id)).toEqual([
      "api",
      "worker",
      "db",
    ]);
  });

  it("exits 1 and reports same-field conflicts, ours preferred", async () => {
    const { basePath, oursPath, theirsPath } = await writeSides(
      docYaml(nodeYaml("api", "base")),
      docYaml(nodeYaml("api", "ours")),
      docYaml(nodeYaml("api", "theirs")),
    );
    const code = await mergeDriverCommand({
      _: [basePath, oursPath, theirsPath],
    });
    expect(code).toBe(1);
    const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(err).toContain('node "api" description');
    const merged = YAML.parse(await readFile(oursPath, "utf-8"));
    expect(merged.nodes[0].description).toBe("ours");
  });

  it("exits 1 when the merge yields an invalid document", async () => {
    // Theirs adds an edge to a node ours deletes — entity-clean merge,
    // semantically dangling edge.
    const base = docYaml([...nodeYaml("api"), ...nodeYaml("legacy")]);
    const ours = docYaml(nodeYaml("api"));
    const theirs = docYaml(
      [...nodeYaml("api"), ...nodeYaml("legacy")],
      [
        "  - id: api-legacy",
        "    from: api",
        "    to: legacy",
        "    relationship: invokes",
      ],
    );
    const { basePath, oursPath, theirsPath } = await writeSides(
      base,
      ours,
      theirs,
    );
    const code = await mergeDriverCommand({
      _: [basePath, oursPath, theirsPath],
    });
    expect(code).toBe(1);
    const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(err).toMatch(/invalid|unknown node/);
  });

  it("treats an empty base as a created-on-both-branches file", async () => {
    const { basePath, oursPath, theirsPath } = await writeSides(
      "",
      docYaml(nodeYaml("api")),
      docYaml(nodeYaml("api")),
    );
    const code = await mergeDriverCommand({
      _: [basePath, oursPath, theirsPath],
    });
    expect(code).toBe(0);
    const merged = YAML.parse(await readFile(oursPath, "utf-8"));
    expect(merged.nodes).toHaveLength(1);
  });

  it("exits 2 on an unparseable side without touching ours", async () => {
    const { basePath, oursPath, theirsPath } = await writeSides(
      docYaml(nodeYaml("api")),
      docYaml(nodeYaml("api")),
      "::: not yaml :::",
    );
    const code = await mergeDriverCommand({
      _: [basePath, oursPath, theirsPath],
    });
    expect(code).toBe(2);
    expect(await readFile(oursPath, "utf-8")).toBe(docYaml(nodeYaml("api")));
  });

  it("exits 2 when paths are missing", async () => {
    const code = await mergeDriverCommand({ _: [] });
    expect(code).toBe(2);
  });

  describe("--install", () => {
    const gitIn = (...args: string[]): void => {
      const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
      if (result.status !== 0) {
        throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
      }
    };

    it("writes git config and .gitattributes", async () => {
      gitIn("init", "-q");
      const code = await mergeDriverCommand({ _: [], install: "true" });
      expect(code).toBe(0);
      const attrs = await readFile(path.join(cwd, ".gitattributes"), "utf-8");
      expect(attrs).toContain("*.archik.yaml merge=archik");
      const driver = spawnSync(
        "git",
        ["config", "merge.archik.driver"],
        { cwd, encoding: "utf-8" },
      );
      expect(driver.stdout.trim()).toBe("npx archik merge-driver %O %A %B");
    });

    it("is idempotent on .gitattributes", async () => {
      gitIn("init", "-q");
      await mergeDriverCommand({ _: [], install: "true" });
      await mergeDriverCommand({ _: [], install: "true" });
      const attrs = await readFile(path.join(cwd, ".gitattributes"), "utf-8");
      const lines = attrs
        .split("\n")
        .filter((l) => l.trim() === "*.archik.yaml merge=archik");
      expect(lines).toHaveLength(1);
    });

    it("fails outside a git repository", async () => {
      const code = await mergeDriverCommand({ _: [], install: "true" });
      expect(code).toBe(1);
    });
  });
});
