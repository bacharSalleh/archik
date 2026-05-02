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
});
