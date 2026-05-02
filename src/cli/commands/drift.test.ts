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
import { driftCommand } from "./drift.ts";

const validBody = (extra = ""): string =>
  [
    'version: "1.0"',
    "name: Demo",
    "nodes:",
    "  - id: orders",
    "    kind: service",
    "    name: Orders",
    "    description: test fixture",
    extra,
    "edges: []",
    "",
  ]
    .filter(Boolean)
    .join("\n");

describe("driftCommand", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-drift-cmd-"));
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

  it("returns 0 when no drift", async () => {
    await mkdir(path.join(cwd, "src", "orders"), { recursive: true });
    await writeFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      validBody("    sourcePath: src/orders/"),
    );
    const code = await driftCommand({ _: [] });
    expect(code).toBe(0);
    const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toMatch(/No drift detected/);
  });

  it("returns 1 and reports orphans", async () => {
    await writeFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      validBody("    sourcePath: src/orders/"),
    );
    const code = await driftCommand({ _: [] });
    expect(code).toBe(1);
    const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toMatch(/ORPHAN/);
    expect(out).toMatch(/orders/);
  });

  it("skips proposed nodes", async () => {
    await writeFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      validBody("    sourcePath: src/orders/\n    status: proposed"),
    );
    const code = await driftCommand({ _: [] });
    expect(code).toBe(0);
  });

  it("reports unmapped directories", async () => {
    await mkdir(path.join(cwd, "src", "orders"), { recursive: true });
    await mkdir(path.join(cwd, "src", "notifications"), { recursive: true });
    await writeFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      validBody("    sourcePath: src/orders/"),
    );
    const code = await driftCommand({ _: [] });
    expect(code).toBe(1);
    const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toMatch(/UNMAPPED/);
    expect(out).toMatch(/src\/notifications\//);
  });

  it("respects .driftignore", async () => {
    await mkdir(path.join(cwd, "src", "orders"), { recursive: true });
    await mkdir(path.join(cwd, "src", "migrations"), { recursive: true });
    await writeFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      validBody("    sourcePath: src/orders/"),
    );
    await writeFile(
      path.join(cwd, ".archik/.driftignore"),
      "src/migrations/**\n",
    );
    const code = await driftCommand({ _: [] });
    expect(code).toBe(0);
    const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toMatch(/IGNORED/);
    expect(out).toMatch(/migrations/);
  });

  describe("human-readable summary line", () => {
    it("prints the issue count in the summary line when drift is found", async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        validBody("    sourcePath: src/orders/"),
      );
      await driftCommand({ _: [] });
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toMatch(/archik drift:/);
      expect(out).toMatch(/1 issue/);
    });

    it("appends the ignored count when some items are ignored", async () => {
      await mkdir(path.join(cwd, "src", "orders"), { recursive: true });
      await mkdir(path.join(cwd, "src", "migrations"), { recursive: true });
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        validBody("    sourcePath: src/orders/"),
      );
      await writeFile(
        path.join(cwd, ".archik/.driftignore"),
        "src/migrations/**\n",
      );
      // One unmapped (migrations, but ignored) + zero orphans → total 0 but
      // ignored > 0, so summary still mentions the ignored count.
      // Add an extra real unmapped dir to ensure total > 0 so summary line shows.
      await mkdir(path.join(cwd, "src", "payments"), { recursive: true });
      await driftCommand({ _: [] });
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toMatch(/\d+ ignored/);
    });
  });

  describe("--json", () => {
    it("emits structured JSON with summary", async () => {
      await mkdir(path.join(cwd, "src", "orders"), { recursive: true });
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        validBody("    sourcePath: src/orders/"),
      );
      const code = await driftCommand({ _: [], json: "true" });
      expect(code).toBe(0);
      const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(stdout);
      expect(parsed.orphan).toHaveLength(0);
      expect(parsed.unmapped).toHaveLength(0);
      expect(parsed.summary.total).toBe(0);
    });

    it("includes orphans in JSON output", async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        validBody("    sourcePath: src/orders/"),
      );
      const code = await driftCommand({ _: [], json: "true" });
      expect(code).toBe(1);
      const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(stdout);
      expect(parsed.orphan).toHaveLength(1);
      expect(parsed.orphan[0].id).toBe("orders");
      expect(parsed.orphan[0].sourcePath).toBe("src/orders/");
      // No `type` discriminator in JSON output
      expect(parsed.orphan[0].type).toBeUndefined();
      expect(parsed.summary.orphan).toBe(1);
    });
  });

  it("scans sub-architecture files and detects orphans in them", async () => {
    await mkdir(path.join(cwd, "src", "orders"), { recursive: true });
    // main file: orders node with existing sourcePath
    await writeFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      validBody("    sourcePath: src/orders/"),
    );
    // sub-file: a node whose sourcePath doesn't exist on disk
    await writeFile(
      path.join(cwd, ".archik/payments.archik.yaml"),
      [
        'version: "1.0"',
        "name: Payments",
        "nodes:",
        "  - id: payments-svc",
        "    kind: service",
        "    name: Payments Service",
        "    description: test fixture",
        "    sourcePath: src/payments/",
        "edges: []",
        "",
      ].join("\n"),
    );
    const code = await driftCommand({ _: [] });
    expect(code).toBe(1);
    const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toMatch(/ORPHAN/);
    expect(out).toMatch(/payments-svc/);
  });

  describe("error handling", () => {
    it("returns 1 when no archik file found", async () => {
      const code = await driftCommand({ _: [] });
      expect(code).toBe(1);
    });

    it("returns 1 for invalid YAML", async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        ":\n  bogus: [unclosed",
      );
      const code = await driftCommand({ _: [] });
      expect(code).toBe(1);
    });

    it("returns 1 for invalid document (missing required fields)", async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        'version: "0.9"\nname: Demo\nnodes: []\nedges: []\n',
      );
      const code = await driftCommand({ _: [] });
      expect(code).toBe(1);
    });

    it("returns structured JSON error when no file found", async () => {
      const code = await driftCommand({ _: [], json: "true" });
      expect(code).toBe(1);
      const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(stdout);
      expect(parsed.error).toBeDefined();
      expect(parsed.summary.total).toBe(0);
    });
  });
});
