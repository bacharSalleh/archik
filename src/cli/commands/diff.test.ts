import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diffCommand } from "./diff.ts";

const nodeDoc = (id: string, name: string): string =>
  [
    'version: "1.0"',
    `name: ${name}`,
    "nodes:",
    `  - id: ${id}`,
    "    kind: external",
    `    name: ${name}`,
    "    description: test fixture",
    "edges: []",
    "",
  ].join("\n");

describe("diffCommand", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-diff-"));
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

  it("returns 0 when two identical documents are compared", async () => {
    const before = path.join(cwd, "before.yaml");
    const after = path.join(cwd, "after.yaml");
    await writeFile(before, nodeDoc("api", "API"));
    await writeFile(after, nodeDoc("api", "API"));
    const code = await diffCommand({ _: [before, after] });
    expect(code).toBe(0);
    const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toMatch(/no changes/i);
  });

  it("reports added nodes in human output", async () => {
    const before = path.join(cwd, "before.yaml");
    const after = path.join(cwd, "after.yaml");
    await writeFile(before, nodeDoc("api", "API"));
    await writeFile(
      after,
      [
        'version: "1.0"',
        "name: After",
        "nodes:",
        "  - id: api",
        "    kind: external",
        "    name: API",
        "    description: test fixture",
        "  - id: db",
        "    kind: external",
        "    name: DB",
        "    description: test fixture",
        "edges: []",
        "",
      ].join("\n"),
    );
    const code = await diffCommand({ _: [before, after] });
    expect(code).toBe(0);
    const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toMatch(/added/i);
    expect(out).toContain("db");
  });

  it("emits JSON when --json is set", async () => {
    const before = path.join(cwd, "before.yaml");
    const after = path.join(cwd, "after.yaml");
    await writeFile(before, nodeDoc("api", "API"));
    await writeFile(after, nodeDoc("api", "API"));
    const code = await diffCommand({ _: [before, after], json: "true" });
    expect(code).toBe(0);
    const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.totals).toBeDefined();
  });

  it("returns 1 when before file is missing", async () => {
    const code = await diffCommand({ _: ["/nonexistent.yaml", "/also-missing.yaml"] });
    expect(code).toBe(1);
  });

  it("returns 1 when no paths given", async () => {
    const code = await diffCommand({ _: [] });
    expect(code).toBe(1);
  });

  it("returns 1 for an invalid --theme value", async () => {
    const before = path.join(cwd, "before.yaml");
    const after = path.join(cwd, "after.yaml");
    await writeFile(before, nodeDoc("api", "API"));
    await writeFile(after, nodeDoc("api", "API"));
    const code = await diffCommand({ _: [before, after], theme: "purple" });
    expect(code).toBe(1);
    const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(err).toMatch(/--theme/);
  });

  it("returns 1 when the after file is missing", async () => {
    const before = path.join(cwd, "before.yaml");
    await writeFile(before, nodeDoc("api", "API"));
    const code = await diffCommand({ _: [before, "/nonexistent-after.yaml"] });
    expect(code).toBe(1);
  });

  it("includes nodes from sub-architecture files when diffing", async () => {
    // before: root + sub-file with extra node
    const beforeDir = path.join(cwd, "before");
    await mkdir(path.join(beforeDir, ".archik"), { recursive: true });
    await writeFile(
      path.join(beforeDir, ".archik/main.archik.yaml"),
      nodeDoc("api", "API"),
    );
    await writeFile(
      path.join(beforeDir, ".archik/payments.archik.yaml"),
      nodeDoc("payments-svc", "Payments Service"),
    );

    // after: root only, no sub-file → payments-svc disappears
    const afterDir = path.join(cwd, "after");
    await mkdir(path.join(afterDir, ".archik"), { recursive: true });
    await writeFile(
      path.join(afterDir, ".archik/main.archik.yaml"),
      nodeDoc("api", "API"),
    );

    process.chdir(beforeDir);
    const code = await diffCommand({
      _: [
        path.join(beforeDir, ".archik/main.archik.yaml"),
        path.join(afterDir, ".archik/main.archik.yaml"),
      ],
      json: "true",
    });
    expect(code).toBe(0);
    const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const parsed = JSON.parse(stdout);
    // payments-svc was in before (via sub-file) but not in after → removed
    const removedIds = parsed.nodes.removed.map((n: { id: string }) => n.id);
    expect(removedIds).toContain("payments-svc");
  });

  describe("git refs", () => {
    const gitIn = (dir: string, ...args: string[]): void => {
      const result = spawnSync("git", args, { cwd: dir, encoding: "utf-8" });
      if (result.status !== 0) {
        throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
      }
    };

    const initRepo = async (): Promise<void> => {
      await mkdir(path.join(cwd, ".archik"), { recursive: true });
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        nodeDoc("api", "API"),
      );
      gitIn(cwd, "init", "-q");
      gitIn(cwd, "config", "user.email", "t@t");
      gitIn(cwd, "config", "user.name", "t");
      gitIn(cwd, "config", "commit.gpgsign", "false");
      gitIn(cwd, "add", "-A");
      gitIn(cwd, "commit", "-qm", "init");
    };

    it("compares a git ref against the working tree (one-arg form)", async () => {
      await initRepo();
      // Working tree gains a node that HEAD doesn't have.
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        [
          'version: "1.0"',
          "name: After",
          "nodes:",
          "  - id: api",
          "    kind: external",
          "    name: API",
          "    description: test fixture",
          "  - id: db",
          "    kind: external",
          "    name: DB",
          "    description: test fixture",
          "edges: []",
          "",
        ].join("\n"),
      );
      const code = await diffCommand({ _: ["HEAD"], json: "true" });
      expect(code).toBe(0);
      const parsed = JSON.parse(
        logSpy.mock.calls.map((c) => c.join(" ")).join("\n"),
      );
      expect(parsed.ok).toBe(true);
      const addedIds = parsed.nodes.added.map((n: { id: string }) => n.id);
      expect(addedIds).toContain("db");
    });

    it("compares two git refs and includes sub-files at the ref", async () => {
      await initRepo();
      gitIn(cwd, "tag", "v1");
      await writeFile(
        path.join(cwd, ".archik/payments.archik.yaml"),
        nodeDoc("payments-svc", "Payments Service"),
      );
      gitIn(cwd, "add", "-A");
      gitIn(cwd, "commit", "-qm", "add payments sub-file");
      gitIn(cwd, "tag", "v2");
      const code = await diffCommand({ _: ["v1", "v2"], json: "true" });
      expect(code).toBe(0);
      const parsed = JSON.parse(
        logSpy.mock.calls.map((c) => c.join(" ")).join("\n"),
      );
      const addedIds = parsed.nodes.added.map((n: { id: string }) => n.id);
      expect(addedIds).toContain("payments-svc");
    });

    it("prefers an on-disk file over a same-named ref", async () => {
      await initRepo();
      // A file literally named "HEAD" in the cwd must win over the ref.
      await writeFile(path.join(cwd, "HEAD"), nodeDoc("api", "API"));
      const code = await diffCommand({
        _: ["HEAD", ".archik/main.archik.yaml"],
        json: "true",
      });
      expect(code).toBe(0);
      const parsed = JSON.parse(
        logSpy.mock.calls.map((c) => c.join(" ")).join("\n"),
      );
      expect(parsed.totals).toEqual({ added: 0, removed: 0, changed: 0 });
    });

    it("errors clearly when the spec is neither a file nor a ref", async () => {
      await initRepo();
      const code = await diffCommand({ _: ["no-such-branch"] });
      expect(code).toBe(1);
      const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(err).toMatch(/neither a file on disk nor a git ref/);
    });

    it("errors when the ref has no archik document", async () => {
      await mkdir(path.join(cwd, ".archik"), { recursive: true });
      await writeFile(path.join(cwd, "readme.md"), "x");
      gitIn(cwd, "init", "-q");
      gitIn(cwd, "config", "user.email", "t@t");
      gitIn(cwd, "config", "user.name", "t");
      gitIn(cwd, "config", "commit.gpgsign", "false");
      gitIn(cwd, "add", "-A");
      gitIn(cwd, "commit", "-qm", "no archik yet");
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        nodeDoc("api", "API"),
      );
      const code = await diffCommand({ _: ["HEAD"] });
      expect(code).toBe(1);
      const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(err).toMatch(/no archik document/);
    });
  });
});
