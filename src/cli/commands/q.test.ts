import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { qCommand } from "./q.ts";

/**
 * The contract that agents will rely on:
 *   1. exit code reflects the data, NOT the output format
 *   2. JSON mode always emits a top-level object with `ok`
 *   3. `--json`, `--json=true`, `--json=1` all enable JSON mode
 *   4. a broken root file is fatal even when sub-files load fine
 *
 * If you need to evolve any of these, do it deliberately — every
 * Claude / Cursor / Aider session shelling out to `archik q` reads
 * the exit code first and parses stdout second.
 */

const minimalDoc = (extra = ""): string =>
  [
    'version: "1.0"',
    "name: Demo",
    "nodes:",
    "  - id: api",
    "    kind: external",
    "    name: API",
    "    description: test fixture",
    extra,
    "edges: []",
    "",
  ]
    .filter(Boolean)
    .join("\n");

describe("qCommand", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-q-"));
    await mkdir(path.join(cwd, ".archik"));
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

  describe("exit-code parity between human and JSON modes", () => {
    beforeEach(async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        minimalDoc(),
      );
    });

    it("`q deps <leaf>` returns 1 in both modes when no outgoing edges", async () => {
      const human = await qCommand({ _: ["deps", "api"] });
      const json = await qCommand({ _: ["deps", "api"], json: "true" });
      expect(human).toBe(1);
      expect(json).toBe(1);
    });

    it("`q dependents <leaf>` returns 1 in both modes when no incoming edges", async () => {
      const human = await qCommand({ _: ["dependents", "api"] });
      const json = await qCommand({ _: ["dependents", "api"], json: "true" });
      expect(human).toBe(1);
      expect(json).toBe(1);
    });

    it("`q list --kind <unmatched>` returns 1 in both modes", async () => {
      const human = await qCommand({ _: ["list"], kind: "topic" });
      const json = await qCommand({
        _: ["list"],
        kind: "topic",
        json: "true",
      });
      expect(human).toBe(1);
      expect(json).toBe(1);
    });

    it("`q edges --rel <unmatched>` returns 1 in both modes", async () => {
      const human = await qCommand({ _: ["edges"], rel: "writes" });
      const json = await qCommand({
        _: ["edges"],
        rel: "writes",
        json: "true",
      });
      expect(human).toBe(1);
      expect(json).toBe(1);
    });

    it("`q describe <unknown>` returns 1 in both modes", async () => {
      const human = await qCommand({ _: ["describe", "ghost"] });
      const json = await qCommand({
        _: ["describe", "ghost"],
        json: "true",
      });
      expect(human).toBe(1);
      expect(json).toBe(1);
    });
  });

  describe("JSON output shape", () => {
    beforeEach(async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        minimalDoc(),
      );
    });

    it("describe emits { ok, file, node, outbound, inbound } on success", async () => {
      const code = await qCommand({
        _: ["describe", "api"],
        json: "true",
      });
      expect(code).toBe(0);
      const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(stdout);
      expect(parsed.ok).toBe(true);
      expect(parsed.node.id).toBe("api");
      expect(Array.isArray(parsed.outbound)).toBe(true);
      expect(Array.isArray(parsed.inbound)).toBe(true);
    });

    it("describe emits { ok: false, error } on unknown id", async () => {
      const code = await qCommand({
        _: ["describe", "ghost"],
        json: "true",
      });
      expect(code).toBe(1);
      const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(stdout);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toMatch(/no node/i);
    });

    it("stats always emits { ok: true, files, nodes, edges, kinds, relationships }", async () => {
      const code = await qCommand({ _: ["stats"], json: "true" });
      expect(code).toBe(0);
      const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(stdout);
      expect(parsed.ok).toBe(true);
      expect(parsed.files).toBe(1);
      expect(parsed.nodes).toBe(1);
      expect(typeof parsed.kinds).toBe("object");
    });
  });

  describe("--json flag accepts lenient forms", () => {
    beforeEach(async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        minimalDoc(),
      );
    });

    it("treats --json (boolean) as true", async () => {
      await qCommand({ _: ["stats"], json: "true" });
      const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(() => JSON.parse(stdout)).not.toThrow();
    });

    it("treats --json=1 as true (matches validate/diff/suggest convention)", async () => {
      await qCommand({ _: ["stats"], json: "1" });
      const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(() => JSON.parse(stdout)).not.toThrow();
    });

    it("treats --json=false as off", async () => {
      const code = await qCommand({ _: ["stats"], json: "false" });
      expect(code).toBe(0);
      const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      // Human format starts with bold "files:" — never valid JSON.
      expect(() => JSON.parse(stdout)).toThrow();
    });
  });

  describe("root file failures are fatal", () => {
    it("returns exit 2 when the root file fails to parse, even if sub-files are fine", async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        "::: not yaml :::",
      );
      await writeFile(
        path.join(cwd, ".archik/peer.archik.yaml"),
        minimalDoc(),
      );
      const code = await qCommand({ _: ["stats"], json: "true" });
      expect(code).toBe(2);
    });

    it("returns exit 2 when no root file exists at all", async () => {
      const code = await qCommand({ _: ["stats"], json: "true" });
      expect(code).toBe(2);
    });
  });
});
