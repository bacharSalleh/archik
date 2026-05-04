import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { alphaCommand } from "./alpha.ts";

/**
 * End-to-end coverage for `archik alpha`. Pure schema/checks tests
 * cover the building blocks; this file pins CLI shape (subcommand
 * dispatch, exit codes, file write semantics).
 */
const minimalArch = (extraNodes = ""): string =>
  [
    'version: "1.0"',
    "name: Demo",
    "nodes:",
    "  - id: api",
    "    kind: service",
    "    name: API",
    "    description: x",
    "    sourcePath: src/api",
    extraNodes,
    "edges: []",
    "",
  ]
    .filter(Boolean)
    .join("\n");

const minimalActors = `
version: "1.0"
actors:
  - id: customer
    kind: human
    description: End-user.
`.trim();

const minimalUC = (id = "place-order", primary = "customer"): string =>
  [
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
    "    description: Happy.",
    "    flows: [basic]",
    "    tests: [tests/happy.spec.ts]",
    "",
  ].join("\n");

describe("alphaCommand", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-alpha-"));
    await mkdir(path.join(cwd, ".archik"), { recursive: true });
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

  const writeBaseline = async (): Promise<void> => {
    await writeFile(path.join(cwd, ".archik/main.archik.yaml"), minimalArch());
    await writeFile(
      path.join(cwd, ".archik/actors.archik.actors.yaml"),
      minimalActors,
    );
    await mkdir(path.join(cwd, ".archik/usecases"), { recursive: true });
    await writeFile(
      path.join(cwd, ".archik/usecases/place-order.archik.uc.yaml"),
      minimalUC(),
    );
  };

  describe("show", () => {
    it("prints '(no alphas file yet)' when no file exists", async () => {
      await writeBaseline();
      const code = await alphaCommand({ _: ["show"] });
      expect(code).toBe(0);
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain("no alphas file yet");
    });

    it("emits stable JSON for the four alphas", async () => {
      await writeBaseline();
      const code = await alphaCommand({ _: ["show"], json: "true" });
      expect(code).toBe(0);
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.ok).toBe(true);
      expect(parsed.file).toBeNull();
      expect(parsed.alphas).toHaveLength(4);
      const names = parsed.alphas.map((a: { alpha: string }) => a.alpha);
      expect(names).toEqual([
        "stakeholders",
        "requirements",
        "softwareSystem",
        "work",
      ]);
      // No file → every row is "missing".
      expect(parsed.alphas.every((a: { verification: string }) => a.verification === "missing")).toBe(true);
    });

    it("verifies a claim that holds", async () => {
      await writeBaseline();
      await writeFile(
        path.join(cwd, ".archik/alphas.archik.alphas.yaml"),
        `version: "1.0"\nalphas:\n  requirements:\n    state: acceptable\n`,
      );
      const code = await alphaCommand({ _: ["show"], json: "true" });
      expect(code).toBe(0);
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(out);
      const req = parsed.alphas.find(
        (a: { alpha: string }) => a.alpha === "requirements",
      );
      expect(req.verification).toBe("verified");
      expect(req.state).toBe("acceptable");
    });

    it("flags an over-claimed state with reason", async () => {
      await writeBaseline();
      // Claim "ready" — needs every active slice "level: full" in
      // trace. We have a slice with no realization, so it's partial.
      await writeFile(
        path.join(cwd, ".archik/alphas.archik.alphas.yaml"),
        `version: "1.0"\nalphas:\n  softwareSystem:\n    state: ready\n`,
      );
      const code = await alphaCommand({ _: ["show"], json: "true" });
      expect(code).toBe(0);
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(out);
      const ss = parsed.alphas.find(
        (a: { alpha: string }) => a.alpha === "softwareSystem",
      );
      expect(ss.verification).toBe("over-claimed");
      expect(ss.reason).toMatch(/Trace matrix|active slice/);
    });

    it("marks subjective states as 'subjective'", async () => {
      await writeBaseline();
      await writeFile(
        path.join(cwd, ".archik/alphas.archik.alphas.yaml"),
        `version: "1.0"\nalphas:\n  stakeholders:\n    state: in-agreement\n`,
      );
      const code = await alphaCommand({ _: ["show"], json: "true" });
      expect(code).toBe(0);
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(out);
      const sh = parsed.alphas.find(
        (a: { alpha: string }) => a.alpha === "stakeholders",
      );
      expect(sh.verification).toBe("subjective");
    });
  });

  describe("promote", () => {
    it("creates the alphas file on first promote", async () => {
      await writeBaseline();
      const code = await alphaCommand({
        _: ["promote", "requirements", "conceived"],
      });
      expect(code).toBe(0);
      const written = await readFile(
        path.join(cwd, ".archik/alphas.archik.alphas.yaml"),
        "utf-8",
      );
      const parsed = YAML.parse(written) as {
        alphas: { requirements?: { state: string } };
      };
      expect(parsed.alphas.requirements?.state).toBe("conceived");
    });

    it("promotes through machine checks when conditions hold", async () => {
      await writeBaseline();
      // requirements.acceptable: every active slice has on-disk tests.
      const code = await alphaCommand({
        _: ["promote", "requirements", "acceptable"],
      });
      expect(code).toBe(0);
    });

    it("rejects a promote when the check fails", async () => {
      await writeBaseline();
      // softwareSystem.ready: trace must be all "full" — we have a
      // partial slice. Should fail.
      const code = await alphaCommand({
        _: ["promote", "softwareSystem", "ready"],
        json: "true",
      });
      expect(code).toBe(1);
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toMatch(/Trace matrix|active slice/);
    });

    it("rejects a promote that would walk DOWN the ladder", async () => {
      await writeBaseline();
      // Set requirements to acceptable first.
      await alphaCommand({
        _: ["promote", "requirements", "acceptable"],
      });
      // Now try to "promote" to a lower state.
      const code = await alphaCommand({
        _: ["promote", "requirements", "bounded"],
      });
      expect(code).toBe(1);
      const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(err).toMatch(/already at "acceptable"/);
    });

    it("rejects an unknown alpha", async () => {
      await writeBaseline();
      const code = await alphaCommand({
        _: ["promote", "team", "performing"],
      });
      expect(code).toBe(2);
    });

    it("rejects an unknown state", async () => {
      await writeBaseline();
      const code = await alphaCommand({
        _: ["promote", "requirements", "ghost"],
      });
      expect(code).toBe(2);
      const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(err).toMatch(/unknown state "ghost"/);
    });

    it("succeeds for a subjective state without running a check", async () => {
      await writeBaseline();
      // First climb to represented (recognised + represented have checks
      // we can pass), then jump to in-agreement (subjective — no check).
      await alphaCommand({
        _: ["promote", "stakeholders", "represented"],
      });
      const code = await alphaCommand({
        _: ["promote", "stakeholders", "in-agreement"],
        note: "kickoff",
      });
      expect(code).toBe(0);
      const written = await readFile(
        path.join(cwd, ".archik/alphas.archik.alphas.yaml"),
        "utf-8",
      );
      const parsed = YAML.parse(written) as {
        alphas: { stakeholders?: { state: string; note?: string } };
      };
      expect(parsed.alphas.stakeholders?.state).toBe("in-agreement");
      expect(parsed.alphas.stakeholders?.note).toBe("kickoff");
    });
  });

  describe("demote", () => {
    it("walks DOWN the ladder", async () => {
      await writeBaseline();
      await alphaCommand({
        _: ["promote", "requirements", "acceptable"],
      });
      const code = await alphaCommand({
        _: ["demote", "requirements", "conceived"],
      });
      expect(code).toBe(0);
      const written = await readFile(
        path.join(cwd, ".archik/alphas.archik.alphas.yaml"),
        "utf-8",
      );
      const parsed = YAML.parse(written) as {
        alphas: { requirements?: { state: string } };
      };
      expect(parsed.alphas.requirements?.state).toBe("conceived");
    });

    it("rejects a demote that would walk UP", async () => {
      await writeBaseline();
      await alphaCommand({
        _: ["promote", "requirements", "conceived"],
      });
      const code = await alphaCommand({
        _: ["demote", "requirements", "acceptable"],
      });
      expect(code).toBe(1);
      const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(err).toMatch(/already at "conceived"/);
    });

    it("rejects when there is no alphas file", async () => {
      await writeBaseline();
      const code = await alphaCommand({
        _: ["demote", "requirements", "conceived"],
      });
      expect(code).toBe(1);
      const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(err).toMatch(/no alphas file/);
    });
  });

  describe("dispatch", () => {
    it("treats no subcommand as 'show'", async () => {
      await writeBaseline();
      const code = await alphaCommand({ _: [] });
      expect(code).toBe(0);
    });

    it("returns 2 for unknown subcommand", async () => {
      await writeBaseline();
      const code = await alphaCommand({ _: ["explode"] });
      expect(code).toBe(2);
    });

    it("'help' subcommand prints help and exits 0", async () => {
      const code = await alphaCommand({ _: ["help"] });
      expect(code).toBe(0);
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain("archik alpha");
    });
  });
});
