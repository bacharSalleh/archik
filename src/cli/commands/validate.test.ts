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

  describe("human-readable output", () => {
    it("prints success with checkmark, filename, node and edge counts", async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        validBody(),
      );
      const code = await validateCommand({ _: [] });
      expect(code).toBe(0);
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toMatch(/✓/);
      expect(out).toContain("main.archik.yaml");
      expect(out).toMatch(/\d+ nodes/);
      expect(out).toMatch(/\d+ edges/);
    });

    it("prints error with ✗ and filename to stderr for invalid schema", async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        'version: "0.9"\nname: Demo\nnodes: []\nedges: []\n',
      );
      const code = await validateCommand({ _: [] });
      expect(code).toBe(1);
      const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(err).toMatch(/✗/);
      expect(err).toContain("main.archik.yaml");
    });

    it("includes file count in success message for multi-file projects", async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        validBody("    archikFile: .archik/payments.archik.yaml"),
      );
      await writeFile(
        path.join(cwd, ".archik/payments.archik.yaml"),
        validBody(),
      );
      const code = await validateCommand({ _: [] });
      expect(code).toBe(0);
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toMatch(/2 files/);
    });
  });

  describe("sub-file validation", () => {
    it("catches schema errors in sub-architecture files", async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        validBody("    archikFile: .archik/payments.archik.yaml"),
      );
      // sub-file has an invalid version field — schema error
      await writeFile(
        path.join(cwd, ".archik/payments.archik.yaml"),
        'version: "0.9"\nname: Payments\nnodes: []\nedges: []\n',
      );
      const code = await validateCommand({ _: [] });
      expect(code).toBe(1);
      const errOutput = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(errOutput).toMatch(/payments\.archik\.yaml/);
    });

    it("returns 0 when main and all sub-files are valid", async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        validBody("    archikFile: .archik/payments.archik.yaml"),
      );
      await writeFile(
        path.join(cwd, ".archik/payments.archik.yaml"),
        validBody(),
      );
      const code = await validateCommand({ _: [] });
      expect(code).toBe(0);
    });
  });

  describe("use cases + actors (Milestone 1)", () => {
    const writeMain = async () =>
      writeFile(path.join(cwd, ".archik/main.archik.yaml"), validBody());

    const writeActors = async () => {
      await writeFile(
        path.join(cwd, ".archik/actors.archik.actors.yaml"),
        [
          'version: "1.0"',
          "actors:",
          "  - id: customer",
          "    kind: human",
          "    description: End-user buying products.",
          "",
        ].join("\n"),
      );
    };

    it("passes when actors + use case + tests all line up", async () => {
      await writeMain();
      await writeActors();
      await mkdir(path.join(cwd, ".archik/usecases"), { recursive: true });
      await writeFile(
        path.join(cwd, ".archik/usecases/place-order.archik.uc.yaml"),
        [
          'version: "1.0"',
          "id: place-order",
          "name: Place an order",
          "primaryActor: customer",
          "goal: Customer pays.",
          "flows:",
          "  basic:",
          "    steps: [a, b]",
          "slices:",
          "  - id: happy",
          "    description: Happy path.",
          "    flows: [basic]",
          "    tests: [tests/happy.spec.ts]",
          "",
        ].join("\n"),
      );
      await mkdir(path.join(cwd, "tests"), { recursive: true });
      await writeFile(path.join(cwd, "tests/happy.spec.ts"), "");
      const code = await validateCommand({ _: [] });
      expect(code).toBe(0);
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toMatch(/1 use case/);
      expect(out).toMatch(/1 actor/);
    });

    it("fails when a use case references an unknown actor", async () => {
      await writeMain();
      // No actors file at all → primaryActor "customer" is unknown.
      await mkdir(path.join(cwd, ".archik/usecases"), { recursive: true });
      await writeFile(
        path.join(cwd, ".archik/usecases/place-order.archik.uc.yaml"),
        [
          'version: "1.0"',
          "id: place-order",
          "name: Place an order",
          "primaryActor: customer",
          "goal: x",
          "flows:",
          "  basic:",
          "    steps: [a]",
          "slices:",
          "  - id: happy",
          "    description: Happy.",
          "    flows: [basic]",
          "    tests: [tests/happy.spec.ts]",
          "",
        ].join("\n"),
      );
      await mkdir(path.join(cwd, "tests"), { recursive: true });
      await writeFile(path.join(cwd, "tests/happy.spec.ts"), "");
      const code = await validateCommand({ _: [] });
      expect(code).toBe(1);
      const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(err).toMatch(/unknown primaryActor/);
    });

    it("fails when a slice's test path doesn't exist on disk", async () => {
      await writeMain();
      await writeActors();
      await mkdir(path.join(cwd, ".archik/usecases"), { recursive: true });
      await writeFile(
        path.join(cwd, ".archik/usecases/place-order.archik.uc.yaml"),
        [
          'version: "1.0"',
          "id: place-order",
          "name: Place an order",
          "primaryActor: customer",
          "goal: x",
          "flows:",
          "  basic:",
          "    steps: [a]",
          "slices:",
          "  - id: happy",
          "    description: Happy.",
          "    flows: [basic]",
          "    tests: [tests/missing.spec.ts]",
          "",
        ].join("\n"),
      );
      const code = await validateCommand({ _: [] });
      expect(code).toBe(1);
      const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(err).toMatch(/does not exist on disk/);
    });

    it("fails when a realizes-bound seq violates ECB rules", async () => {
      // ui = boundary, db = entity → forbidden direct call.
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        [
          'version: "1.0"',
          "name: Demo",
          "nodes:",
          "  - id: ui",
          "    kind: frontend",
          "    name: UI",
          "    description: x",
          "    sourcePath: src/ui",
          "    stereotype: boundary",
          "  - id: db",
          "    kind: database",
          "    name: DB",
          "    description: x",
          "    stereotype: entity",
          "    seqFiles:",
          "      - .archik/bad.archik.seq.yaml",
          "edges: []",
          "",
        ].join("\n"),
      );
      await mkdir(path.join(cwd, "src/ui"), { recursive: true });
      await writeActors();
      await mkdir(path.join(cwd, ".archik/usecases"), { recursive: true });
      await writeFile(
        path.join(cwd, ".archik/usecases/place-order.archik.uc.yaml"),
        [
          'version: "1.0"',
          "id: place-order",
          "name: Place an order",
          "primaryActor: customer",
          "goal: x",
          "flows:",
          "  basic:",
          "    steps: [a]",
          "slices:",
          "  - id: happy",
          "    description: Happy.",
          "    flows: [basic]",
          "    tests: [tests/happy.spec.ts]",
          "    realization:",
          "      seqFile: .archik/bad.archik.seq.yaml",
          "",
        ].join("\n"),
      );
      await writeFile(
        path.join(cwd, ".archik/bad.archik.seq.yaml"),
        [
          'version: "1.0"',
          "name: Bad ECB",
          "realizes:",
          "  useCase: place-order",
          "  slice: happy",
          "participants:",
          "  - id: u",
          "    nodeId: ui",
          "  - id: d",
          "    nodeId: db",
          "steps:",
          "  - type: message",
          "    id: m1",
          "    from: u",
          "    to: d",
          "    label: query",
          "    arrow: sync",
          "",
        ].join("\n"),
      );
      await mkdir(path.join(cwd, "tests"), { recursive: true });
      await writeFile(path.join(cwd, "tests/happy.spec.ts"), "");
      const code = await validateCommand({ _: [] });
      expect(code).toBe(1);
      const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(err).toMatch(/ECB violation/);
      expect(err).toMatch(/boundary → entity/);
    });

    it("passes when a realizes-bound seq follows ECB rules", async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        [
          'version: "1.0"',
          "name: Demo",
          "nodes:",
          "  - id: ui",
          "    kind: frontend",
          "    name: UI",
          "    description: x",
          "    sourcePath: src/ui",
          "    stereotype: boundary",
          "    seqFiles:",
          "      - .archik/good.archik.seq.yaml",
          "  - id: orch",
          "    kind: service",
          "    name: Orch",
          "    description: x",
          "    sourcePath: src/orch",
          "    stereotype: control",
          "    seqFiles:",
          "      - .archik/good.archik.seq.yaml",
          "edges: []",
          "",
        ].join("\n"),
      );
      await mkdir(path.join(cwd, "src/ui"), { recursive: true });
      await mkdir(path.join(cwd, "src/orch"), { recursive: true });
      await writeActors();
      await mkdir(path.join(cwd, ".archik/usecases"), { recursive: true });
      await writeFile(
        path.join(cwd, ".archik/usecases/x.archik.uc.yaml"),
        [
          'version: "1.0"',
          "id: x",
          "name: X",
          "primaryActor: customer",
          "goal: x",
          "flows:",
          "  basic:",
          "    steps: [a]",
          "slices:",
          "  - id: happy",
          "    description: Happy.",
          "    flows: [basic]",
          "    tests: [tests/happy.spec.ts]",
          "    realization:",
          "      seqFile: .archik/good.archik.seq.yaml",
          "",
        ].join("\n"),
      );
      await writeFile(
        path.join(cwd, ".archik/good.archik.seq.yaml"),
        [
          'version: "1.0"',
          "name: Good ECB",
          "realizes:",
          "  useCase: x",
          "  slice: happy",
          "participants:",
          "  - id: u",
          "    nodeId: ui",
          "  - id: o",
          "    nodeId: orch",
          "steps:",
          "  - type: message",
          "    id: m1",
          "    from: u",
          "    to: o",
          "    label: go",
          "    arrow: sync",
          "",
        ].join("\n"),
      );
      await mkdir(path.join(cwd, "tests"), { recursive: true });
      await writeFile(path.join(cwd, "tests/happy.spec.ts"), "");
      const code = await validateCommand({ _: [] });
      expect(code).toBe(0);
    });

    it("fails on bidirectional realizes mismatch", async () => {
      // Main file exposes an `agent` node so the seq file's
      // participant.nodeId resolves; seq file says it realizes
      // place-order/happy but the slice's realization.seqFile
      // points at a different file.
      await writeMain();
      await writeActors();
      // The seq file (must end in .archik.seq.yaml).
      await writeFile(
        path.join(cwd, ".archik/place-order.archik.seq.yaml"),
        [
          'version: "1.0"',
          "name: Place order seq",
          "realizes:",
          "  useCase: place-order",
          "  slice: happy",
          "participants:",
          "  - id: a",
          "    nodeId: agent",
          "steps: []",
          "",
        ].join("\n"),
      );
      await mkdir(path.join(cwd, ".archik/usecases"), { recursive: true });
      await writeFile(
        path.join(cwd, ".archik/usecases/place-order.archik.uc.yaml"),
        [
          'version: "1.0"',
          "id: place-order",
          "name: Place an order",
          "primaryActor: customer",
          "goal: x",
          "flows:",
          "  basic:",
          "    steps: [a]",
          "slices:",
          "  - id: happy",
          "    description: Happy.",
          "    flows: [basic]",
          "    tests: [tests/happy.spec.ts]",
          "    realization:",
          // Wrong target → bidirectional check fails.
          "      seqFile: .archik/other.archik.seq.yaml",
          "",
        ].join("\n"),
      );
      await mkdir(path.join(cwd, "tests"), { recursive: true });
      await writeFile(path.join(cwd, "tests/happy.spec.ts"), "");
      const code = await validateCommand({ _: [] });
      expect(code).toBe(1);
      const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      // Either side of the bidirectional check can fire — the
      // realization.seqFile points at a missing file, so the
      // realization-paths check trips before the seq-side check.
      expect(err).toMatch(/other\.archik\.seq\.yaml|Pick one canonical/);
    });
  });
});
