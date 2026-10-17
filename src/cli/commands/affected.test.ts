import { spawnSync } from "node:child_process";
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
import { affectedCommand } from "./affected.ts";

/**
 * End-to-end coverage for `archik affected`. The pure mapping is
 * covered in domain/affected.test.ts; this file pins CLI shape:
 * --files (no git needed), --since against a real git repo, JSON
 * output, and exit codes.
 */
const archYaml = [
  'version: "1.0"',
  "name: Demo",
  "nodes:",
  "  - id: api",
  "    kind: service",
  "    name: API",
  "    description: x",
  "    sourcePath: src/api",
  "  - id: web",
  "    kind: frontend",
  "    name: Web",
  "    description: x",
  "  - id: db",
  "    kind: database",
  "    name: DB",
  "    description: x",
  "edges:",
  "  - id: web-api",
  "    from: web",
  "    to: api",
  "    relationship: invokes",
  "",
].join("\n");

function gitIn(cwd: string, ...args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
}

describe("affectedCommand", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-affected-"));
    await mkdir(path.join(cwd, ".archik"), { recursive: true });
    await mkdir(path.join(cwd, "src/api"), { recursive: true });
    await writeFile(path.join(cwd, ".archik/main.archik.yaml"), archYaml);
    await writeFile(path.join(cwd, "src/api/routes.ts"), "export {};\n");
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

  const output = (): string => logSpy.mock.calls.map((c) => c.join(" ")).join("\n");

  describe("--files", () => {
    it("maps explicit files without needing git", async () => {
      const code = await affectedCommand({ _: [], files: "src/api/routes.ts" });
      expect(code).toBe(0);
      const out = output();
      expect(out).toContain("api");
      expect(out).toContain("DEPENDENTS");
      expect(out).toContain("web");
    });

    it("emits a stable JSON shape", async () => {
      const code = await affectedCommand({
        _: [],
        files: "src/api/routes.ts,other.txt",
        json: "true",
      });
      expect(code).toBe(0);
      const parsed = JSON.parse(output());
      expect(parsed.ok).toBe(true);
      expect(parsed.nodes).toHaveLength(1);
      expect(parsed.nodes[0].id).toBe("api");
      expect(parsed.dependents).toEqual([
        { id: "web", kind: "frontend", name: "Web", dependsOn: ["api"] },
      ]);
      expect(parsed.unmapped).toEqual(["other.txt"]);
      expect(parsed.summary.changedFiles).toBe(2);
    });

    it('prints "No changed files" for an empty list', async () => {
      const code = await affectedCommand({ _: [], files: " " });
      expect(code).toBe(0);
      expect(output()).toContain("No changed files");
    });
  });

  describe("--since (git)", () => {
    it("diffs the working tree against a ref", async () => {
      gitIn(cwd, "init", "-q");
      gitIn(cwd, "config", "user.email", "t@t");
      gitIn(cwd, "config", "user.name", "t");
      // A globally-configured signing setup (CI sandboxes, corporate
      // machines) must not be able to fail these fixture commits.
      gitIn(cwd, "config", "commit.gpgsign", "false");
      gitIn(cwd, "add", "-A");
      gitIn(cwd, "commit", "-qm", "init");
      await writeFile(
        path.join(cwd, "src/api/routes.ts"),
        "export const x = 1;\n",
      );
      const code = await affectedCommand({ _: [] });
      expect(code).toBe(0);
      const out = output();
      expect(out).toContain("api");
      expect(out).toContain("web");
    });

    it("includes untracked files", async () => {
      gitIn(cwd, "init", "-q");
      gitIn(cwd, "config", "user.email", "t@t");
      gitIn(cwd, "config", "user.name", "t");
      // A globally-configured signing setup (CI sandboxes, corporate
      // machines) must not be able to fail these fixture commits.
      gitIn(cwd, "config", "commit.gpgsign", "false");
      gitIn(cwd, "add", "-A");
      gitIn(cwd, "commit", "-qm", "init");
      await writeFile(path.join(cwd, "src/api/new-handler.ts"), "export {};\n");
      const code = await affectedCommand({ _: [], json: "true" });
      expect(code).toBe(0);
      const parsed = JSON.parse(output());
      expect(parsed.nodes[0].files).toContain("src/api/new-handler.ts");
    });

    it("fails with a clear error outside a git repo", async () => {
      const code = await affectedCommand({ _: [] });
      expect(code).toBe(1);
      const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(err).toContain("git");
    });

    it("resolves paths correctly when the project sits below the git toplevel", async () => {
      // Monorepo layout: git root one level up, archik project in app/.
      const top = await mkdtemp(path.join(tmpdir(), "archik-mono-"));
      const app = path.join(top, "app");
      await mkdir(path.join(app, ".archik"), { recursive: true });
      await mkdir(path.join(app, "src/api"), { recursive: true });
      await writeFile(path.join(app, ".archik/main.archik.yaml"), archYaml);
      await writeFile(path.join(app, "src/api/routes.ts"), "export {};\n");
      gitIn(top, "init", "-q");
      gitIn(top, "config", "user.email", "t@t");
      gitIn(top, "config", "user.name", "t");
      gitIn(top, "config", "commit.gpgsign", "false");
      gitIn(top, "add", "-A");
      gitIn(top, "commit", "-qm", "init");
      // One modified + one untracked file, both inside the project.
      await writeFile(
        path.join(app, "src/api/routes.ts"),
        "export const x = 1;\n",
      );
      await writeFile(path.join(app, "src/api/new.ts"), "export {};\n");
      process.chdir(app);
      try {
        const code = await affectedCommand({ _: [], json: "true" });
        expect(code).toBe(0);
        const parsed = JSON.parse(output());
        expect(parsed.nodes).toHaveLength(1);
        expect(parsed.nodes[0].files.sort()).toEqual([
          "src/api/new.ts",
          "src/api/routes.ts",
        ]);
      } finally {
        process.chdir(cwd);
        await rm(top, { recursive: true, force: true });
      }
    });
  });
});
