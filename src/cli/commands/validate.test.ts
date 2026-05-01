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
import { validateCommand } from "./validate.ts";

/**
 * End-to-end coverage for the cross-file existence check. The pure
 * predicate-driven function is exercised in domain/validate.test.ts;
 * this file pins the wiring — the validate command resolves paths
 * relative to the project root (parent of `.archik/`) and exits 1
 * when an `archikFile` points at a missing file. The whole bug
 * report ("Failed to fetch /__archik/file?path=agent-loop.archik.yaml")
 * boils down to that mismatch.
 */
const validBody = (extra = ""): string =>
  [
    'version: "1.0"',
    "name: Demo",
    "nodes:",
    "  - id: agent",
    "    kind: agent",
    "    name: Agent",
    "    description: test fixture",
    extra,
    "edges: []",
    "",
  ]
    .filter(Boolean)
    .join("\n");

describe("validateCommand cross-file existence", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-validate-"));
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

  it("passes when archikFile points at a real file (with the .archik/ prefix)", async () => {
    await writeFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      validBody("    archikFile: .archik/agent-loop.archik.yaml"),
    );
    await writeFile(
      path.join(cwd, ".archik/agent-loop.archik.yaml"),
      validBody(),
    );
    const code = await validateCommand({ _: [] });
    expect(code).toBe(0);
  });

  it("fails when archikFile is missing the .archik/ prefix (the reported bug)", async () => {
    await writeFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      validBody("    archikFile: agent-loop.archik.yaml"),
    );
    // The actual file lives under `.archik/` but the YAML pointed at
    // the project root — the canvas would 404 on this.
    await writeFile(
      path.join(cwd, ".archik/agent-loop.archik.yaml"),
      validBody(),
    );
    const code = await validateCommand({ _: [] });
    expect(code).toBe(1);
    const errOutput = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(errOutput).toMatch(/agent-loop\.archik\.yaml/);
    expect(errOutput).toMatch(/does not exist/);
  });

  it("fails when an edge's toFile points at a missing peer file", async () => {
    await writeFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      [
        'version: "1.0"',
        "name: Demo",
        "nodes:",
        "  - id: api",
        "    kind: external",
        "    name: API",
        "    description: test fixture",
        "edges:",
        "  - id: api-pays",
        "    from: api",
        "    to: charge",
        "    toFile: .archik/payments.archik.yaml",
        "    relationship: http_call",
        "",
      ].join("\n"),
    );
    const code = await validateCommand({ _: [] });
    expect(code).toBe(1);
    const errOutput = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(errOutput).toMatch(/payments\.archik\.yaml/);
  });

  /**
   * Locks the --json output shape that agents will rely on. If you
   * need to evolve it, do it deliberately — bumping a key name here
   * is a breaking change for every Claude / Cursor / Aider session
   * using the CLI.
   */
  describe("--json", () => {
    it("emits { ok: true, file, nodes, edges } on success", async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        validBody(),
      );
      const code = await validateCommand({ _: [], json: "true" });
      expect(code).toBe(0);
      const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(stdout);
      expect(parsed.ok).toBe(true);
      expect(parsed.file).toMatch(/main\.archik\.yaml$/);
      expect(typeof parsed.nodes).toBe("number");
      expect(typeof parsed.edges).toBe("number");
    });

    it("emits { ok: false, file, errors: [{path, message}] } on schema error", async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        'version: "0.9"\nname: Demo\nnodes: []\nedges: []\n',
      );
      const code = await validateCommand({ _: [], json: "true" });
      expect(code).toBe(1);
      const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(stdout);
      expect(parsed.ok).toBe(false);
      expect(parsed.file).toMatch(/main\.archik\.yaml$/);
      expect(Array.isArray(parsed.errors)).toBe(true);
      expect(parsed.errors[0]).toHaveProperty("path");
      expect(parsed.errors[0]).toHaveProperty("message");
    });

    it("emits structured errors for invalid YAML, not human text", async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        ":\n  bogus: [unclosed",
      );
      const code = await validateCommand({ _: [], json: "true" });
      expect(code).toBe(1);
      const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(stdout);
      expect(parsed.ok).toBe(false);
      expect(parsed.errors[0].message).toMatch(/Invalid YAML/);
    });
  });
});
