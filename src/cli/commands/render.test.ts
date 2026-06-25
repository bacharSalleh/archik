import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderCommand } from "./render.ts";

const minimalDoc = (name = "Demo", extra = ""): string =>
  [
    'version: "1.0"',
    `name: ${name}`,
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

describe("renderCommand", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-render-"));
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

  it("renders a single-file diagram and writes an SVG", async () => {
    await writeFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      minimalDoc(),
    );
    const out = path.join(cwd, "out.svg");
    const code = await renderCommand({ _: [], out });
    expect(code).toBe(0);
    const svg = await readFile(out, "utf-8");
    expect(svg).toContain("<svg");
    const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toMatch(/rendered/i);
    expect(logged).toContain("1 nodes");
  });

  it("includes nodes from sub-architecture files in the SVG", async () => {
    await writeFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      minimalDoc(),
    );
    await writeFile(
      path.join(cwd, ".archik/payments.archik.yaml"),
      [
        'version: "1.0"',
        "name: Payments",
        "nodes:",
        "  - id: payments-svc",
        "    kind: external",
        "    name: Payments Service",
        "    description: handles payment processing",
        "edges: []",
        "",
      ].join("\n"),
    );
    const out = path.join(cwd, "out.svg");
    const code = await renderCommand({ _: [], out });
    expect(code).toBe(0);
    const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toMatch(/2 nodes/);
  });

  it("returns 1 when the archik file is not found", async () => {
    const code = await renderCommand({ _: [] });
    expect(code).toBe(1);
  });

  it("returns 1 for invalid YAML", async () => {
    await writeFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      "not: valid: yaml: [[[",
    );
    const code = await renderCommand({ _: [] });
    expect(code).toBe(1);
  });

  it("returns 1 for bad --theme value", async () => {
    await writeFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      minimalDoc(),
    );
    const code = await renderCommand({ _: [], theme: "neon" });
    expect(code).toBe(1);
    const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(err).toMatch(/--theme/);
  });

  describe("view filters", () => {
    it("--focus renders only the neighborhood (node count drops)", async () => {
      // fixture: nodes a (focus), b (connected to a), z (no path to a)
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        [
          'version: "1.0"',
          "name: Focus Test",
          "nodes:",
          "  - id: a",
          "    kind: external",
          "    name: A Node",
          "    description: focus target",
          "  - id: b",
          "    kind: external",
          "    name: B Node",
          "    description: neighbor of a",
          "  - id: z",
          "    kind: external",
          "    name: Z Node",
          "    description: isolated node with no path to a",
          "edges:",
          "  - id: e-a-b",
          "    from: a",
          "    to: b",
          "    relationship: http_call",
          "",
        ].join("\n"),
      );
      const out = path.join(cwd, "focus.svg");
      const code = await renderCommand({ _: [], focus: "a", out });
      expect(code).toBe(0);
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      // focus depth=1 keeps a and b (2 nodes), not z
      expect(logged).toMatch(/2 nodes/);
      expect(logged).not.toMatch(/3 nodes/);
    });

    it("--hide-structural drops structural edges from the summary", async () => {
      // fixture: one runtime edge (http_call) + one structural edge (uses)
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        [
          'version: "1.0"',
          "name: Edge Filter Test",
          "nodes:",
          "  - id: svc",
          "    kind: external",
          "    name: Service",
          "    description: the main service",
          "  - id: db",
          "    kind: external",
          "    name: Database",
          "    description: the database",
          "  - id: lib",
          "    kind: external",
          "    name: Library",
          "    description: a library",
          "edges:",
          "  - id: e-svc-db",
          "    from: svc",
          "    to: db",
          "    relationship: http_call",
          "  - id: e-svc-lib",
          "    from: svc",
          "    to: lib",
          "    relationship: uses",
          "",
        ].join("\n"),
      );
      const out = path.join(cwd, "hide.svg");
      const code = await renderCommand({ _: [], "hide-structural": "true", out });
      expect(code).toBe(0);
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      // 2 edges total; structural (uses) removed => 1 edge remains
      expect(logged).toMatch(/1 edges/);
      expect(logged).not.toMatch(/2 edges/);
    });

    it("--only-rel keeps only matching edges", async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        [
          'version: "1.0"',
          "name: Only Rel Test",
          "nodes:",
          "  - id: x",
          "    kind: external",
          "    name: X",
          "    description: node x",
          "  - id: y",
          "    kind: external",
          "    name: Y",
          "    description: node y",
          "  - id: w",
          "    kind: external",
          "    name: W",
          "    description: node w",
          "edges:",
          "  - id: e-x-y",
          "    from: x",
          "    to: y",
          "    relationship: http_call",
          "  - id: e-x-w",
          "    from: x",
          "    to: w",
          "    relationship: grpc",
          "",
        ].join("\n"),
      );
      const out = path.join(cwd, "onlyrel.svg");
      const code = await renderCommand({ _: [], "only-rel": "http_call", out });
      expect(code).toBe(0);
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      // only http_call edge kept => 1 edge
      expect(logged).toMatch(/1 edges/);
    });

    it("--focus and --hide-structural compose", async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        [
          'version: "1.0"',
          "name: Compose Test",
          "nodes:",
          "  - id: center",
          "    kind: external",
          "    name: Center",
          "    description: focus node",
          "  - id: peer",
          "    kind: external",
          "    name: Peer",
          "    description: connected peer",
          "  - id: dep",
          "    kind: external",
          "    name: Dep",
          "    description: structural dep",
          "  - id: far",
          "    kind: external",
          "    name: Far",
          "    description: unreachable node",
          "edges:",
          "  - id: e-center-peer",
          "    from: center",
          "    to: peer",
          "    relationship: http_call",
          "  - id: e-center-dep",
          "    from: center",
          "    to: dep",
          "    relationship: uses",
          "",
        ].join("\n"),
      );
      const out = path.join(cwd, "compose.svg");
      const code = await renderCommand({
        _: [],
        focus: "center",
        "hide-structural": "true",
        out,
      });
      expect(code).toBe(0);
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      // focus keeps center+peer+dep (3 nodes), hide-structural removes uses => 1 edge
      // far is excluded by focus
      expect(logged).toMatch(/3 nodes/);
      expect(logged).toMatch(/1 edges/);
    });
  });

  describe("--seq flag", () => {
    const minimalSeqDoc = (): string =>
      [
        'version: "1.0"',
        "name: Login Flow",
        "participants:",
        "  - id: client",
        "    nodeId: api",
        "    label: Client",
        "steps:",
        "  - type: message",
        "    id: m1",
        "    from: client",
        "    to: client",
        "    label: login request",
        "    arrow: sync",
        "",
      ].join("\n");

    it("renders a seq YAML to SVG and reports success", async () => {
      const seqFile = path.join(cwd, ".archik/login.archik.seq.yaml");
      await writeFile(seqFile, minimalSeqDoc());
      const outFile = path.join(cwd, "login.svg");
      const code = await renderCommand({ _: [], seq: seqFile, out: outFile });
      expect(code).toBe(0);
      const svg = await readFile(outFile, "utf-8");
      expect(svg).toContain("<svg");
      expect(svg).toContain("Client");
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(logged).toContain("Login Flow");
    });

    it("returns 1 when the seq file does not exist", async () => {
      const code = await renderCommand({ _: [], seq: path.join(cwd, "missing.yaml"), out: path.join(cwd, "out.svg") });
      expect(code).toBe(1);
      const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(err).toContain("Cannot read");
    });

    it("returns 1 for bad --theme value with --seq", async () => {
      const seqFile = path.join(cwd, ".archik/login.archik.seq.yaml");
      await writeFile(seqFile, minimalSeqDoc());
      const code = await renderCommand({ _: [], seq: seqFile, theme: "neon" });
      expect(code).toBe(1);
    });

    it("returns 1 when seq YAML fails schema validation", async () => {
      const seqFile = path.join(cwd, ".archik/bad.archik.seq.yaml");
      // missing required `version` and `participants`
      await writeFile(seqFile, "name: No Version\nsteps: []\n");
      const code = await renderCommand({ _: [], seq: seqFile, out: path.join(cwd, "out.svg") });
      expect(code).toBe(1);
      const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(err).toContain("bad.archik.seq.yaml");
    });
  });
});
