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
import { traceCommand } from "./trace.ts";

/**
 * End-to-end coverage for `archik trace`. Builds a minimal project
 * with a use case + actors + seq + arch and confirms the matrix
 * surfaces the expected coverage level. The pure builder is covered
 * in domain/trace.test.ts; this file pins CLI shape (text + JSON
 * output, filters, exit codes).
 */
const minimalArch = (extraNodes = ""): string =>
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
    "      - .archik/flow.archik.seq.yaml",
    "  - id: api",
    "    kind: service",
    "    name: API",
    "    description: x",
    "    sourcePath: src/api",
    "    stereotype: control",
    extraNodes,
    "edges: []",
    "",
  ]
    .filter(Boolean)
    .join("\n");

const actorsYaml = [
  'version: "1.0"',
  "actors:",
  "  - id: customer",
  "    kind: human",
  "    description: End-user.",
  "  - id: admin",
  "    kind: human",
  "    description: Operator.",
  "",
].join("\n");

const ucYaml = (
  id: string,
  primary = "customer",
  withRealization = true,
): string => {
  // Tests always point at the on-disk fixture so the slice is valid
  // (active slices require ≥ 1 test path). When realization is off,
  // the slice is "partial" rather than "full" — useful for filter
  // tests that need a non-fully-traced row.
  const lines = [
    'version: "1.0"',
    `id: ${id}`,
    `name: ${id}`,
    `primaryActor: ${primary}`,
    "goal: x",
    "flows:",
    "  basic:",
    "    steps: [a]",
    "slices:",
    "  - id: happy",
    "    description: Happy path.",
    "    flows: [basic]",
    "    tests: [tests/happy.spec.ts]",
  ];
  if (withRealization) {
    lines.push("    realization:");
    lines.push("      seqFile: .archik/flow.archik.seq.yaml");
  }
  lines.push("");
  return lines.join("\n");
};

const seqYaml = (ucId: string): string =>
  [
    'version: "1.0"',
    "name: Flow",
    "realizes:",
    `  useCase: ${ucId}`,
    "  slice: happy",
    "participants:",
    "  - id: u",
    "    nodeId: ui",
    "  - id: a",
    "    nodeId: api",
    "steps:",
    "  - type: message",
    "    id: m1",
    "    from: u",
    "    to: a",
    "    label: go",
    "    arrow: sync",
    "",
  ].join("\n");

describe("traceCommand", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-trace-"));
    await mkdir(path.join(cwd, ".archik"));
    await mkdir(path.join(cwd, ".archik/usecases"), { recursive: true });
    await mkdir(path.join(cwd, "src/ui"), { recursive: true });
    await mkdir(path.join(cwd, "src/api"), { recursive: true });
    await mkdir(path.join(cwd, "tests"), { recursive: true });
    await writeFile(path.join(cwd, "tests/happy.spec.ts"), "");
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

  const writeFullProject = async (ucId = "place-order") => {
    await writeFile(path.join(cwd, ".archik/main.archik.yaml"), minimalArch());
    await writeFile(
      path.join(cwd, ".archik/actors.archik.actors.yaml"),
      actorsYaml,
    );
    await writeFile(
      path.join(cwd, `.archik/usecases/${ucId}.archik.uc.yaml`),
      ucYaml(ucId),
    );
    await writeFile(path.join(cwd, ".archik/flow.archik.seq.yaml"), seqYaml(ucId));
  };

  describe("text output", () => {
    it("prints one row per slice and a totals line", async () => {
      await writeFullProject();
      const code = await traceCommand({ _: [] });
      expect(code).toBe(0);
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain("place-order/happy");
      expect(out).toMatch(/totals.*1 slice.*1 use case.*1 full/);
    });

    it('prints "No use case slices to trace" when empty', async () => {
      await writeFile(path.join(cwd, ".archik/main.archik.yaml"), minimalArch());
      const code = await traceCommand({ _: [] });
      expect(code).toBe(0);
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain("No use case slices to trace");
    });
  });

  describe("--json output", () => {
    it("emits a stable TraceMatrix shape", async () => {
      await writeFullProject();
      const code = await traceCommand({ _: [], json: "true" });
      expect(code).toBe(0);
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.ok).toBe(true);
      expect(parsed.summary).toMatchObject({
        useCases: 1,
        slices: 1,
        fullyTraced: 1,
        partial: 0,
        untraced: 0,
      });
      expect(parsed.rows).toHaveLength(1);
      expect(parsed.rows[0]).toMatchObject({
        useCase: "place-order",
        slice: "happy",
        level: "full",
      });
      expect(parsed.rows[0].realization.participants).toHaveLength(2);
    });
  });

  describe("filters", () => {
    it("filters by --use-case", async () => {
      await writeFullProject("place-order");
      // Add a second use case so the filter has something to exclude.
      await writeFile(
        path.join(cwd, ".archik/usecases/admin-only.archik.uc.yaml"),
        ucYaml("admin-only", "admin", false),
      );
      const code = await traceCommand({
        _: [],
        json: "true",
        "use-case": "place-order",
      });
      expect(code).toBe(0);
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.rows).toHaveLength(1);
      expect(parsed.rows[0].useCase).toBe("place-order");
    });

    it("filters by --actor", async () => {
      await writeFullProject("place-order");
      await writeFile(
        path.join(cwd, ".archik/usecases/admin-task.archik.uc.yaml"),
        ucYaml("admin-task", "admin", false),
      );
      const code = await traceCommand({
        _: [],
        json: "true",
        actor: "admin",
      });
      expect(code).toBe(0);
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.rows).toHaveLength(1);
      expect(parsed.rows[0].useCase).toBe("admin-task");
    });

    it("filters by --coverage", async () => {
      await writeFullProject("place-order");
      // Second use case, untraced (no tests, no realization).
      await writeFile(
        path.join(cwd, ".archik/usecases/admin-task.archik.uc.yaml"),
        [
          'version: "1.0"',
          "id: admin-task",
          "name: Admin task",
          "primaryActor: admin",
          "goal: x",
          "flows:",
          "  basic:",
          "    steps: [a]",
          "slices:",
          "  - id: planned",
          "    description: Future.",
          "    flows: [basic]",
          "    status: proposed",
          "",
        ].join("\n"),
      );
      const code = await traceCommand({
        _: [],
        json: "true",
        coverage: "none",
      });
      expect(code).toBe(0);
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.rows).toHaveLength(1);
      expect(parsed.rows[0].slice).toBe("planned");
    });

    it("rejects unknown --status", async () => {
      await writeFullProject();
      const code = await traceCommand({ _: [], status: "weird" });
      expect(code).toBe(2);
    });

    it("rejects unknown --coverage", async () => {
      await writeFullProject();
      const code = await traceCommand({ _: [], coverage: "ish" });
      expect(code).toBe(2);
    });
  });

  describe("--fail-on", () => {
    beforeEach(async () => {
      await writeFullProject("place-order");
      // Add an untraced second slice via a partial use case.
      await writeFile(
        path.join(cwd, ".archik/usecases/admin-task.archik.uc.yaml"),
        [
          'version: "1.0"',
          "id: admin-task",
          "name: Admin task",
          "primaryActor: admin",
          "goal: x",
          "flows:",
          "  basic:",
          "    steps: [a]",
          "slices:",
          "  - id: planned",
          "    description: Future.",
          "    flows: [basic]",
          "    status: proposed",
          "",
        ].join("\n"),
      );
    });

    it("--fail-on partial fails when there are untraced slices", async () => {
      const code = await traceCommand({
        _: [],
        "fail-on": "partial",
      });
      expect(code).toBe(1);
    });

    it("--fail-on none only fails on truly untraced rows", async () => {
      // 'planned' slice has neither tests nor realization → none.
      const code = await traceCommand({ _: [], "fail-on": "none" });
      expect(code).toBe(1);
    });

    it("rejects unknown --fail-on", async () => {
      const code = await traceCommand({ _: [], "fail-on": "nope" });
      expect(code).toBe(2);
    });
  });

  describe("error handling", () => {
    it("returns 2 when no root archik file exists", async () => {
      const code = await traceCommand({ _: [] });
      expect(code).toBe(2);
    });

    it("returns 2 when the root file fails to parse", async () => {
      await writeFile(
        path.join(cwd, ".archik/main.archik.yaml"),
        ":\n  bogus: [unclosed",
      );
      const code = await traceCommand({ _: [], json: "true" });
      expect(code).toBe(2);
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.ok).toBe(false);
    });
  });
});
