import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gapCommand } from "./gap.ts";

const git = (cwd: string, ...args: string[]): void => {
  const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf-8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
};

const model = (invoices: string) => `version: "1.0"
name: Shop
nodes:
  - { id: billing, kind: module, name: Billing, description: x, sourcePath: src/billing }
${invoices}
edges: []
`;

describe("gapCommand", () => {
  let cwd: string;
  let orig: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  const out = (): string => logSpy.mock.calls.map((c) => c.join(" ")).join("\n");

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-gap-"));
    await mkdir(path.join(cwd, ".archik"));
    await mkdir(path.join(cwd, "src/billing"), { recursive: true });
    await mkdir(path.join(cwd, "src/invoices"), { recursive: true });
    await writeFile(path.join(cwd, "src/invoices/index.ts"), "export {};\n");
    await writeFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      model("  - { id: invoices, kind: service, name: Invoices, description: x, sourcePath: src/invoices }"),
    );
    git(cwd, "init", "-q");
    git(cwd, "add", "-A");
    git(cwd, "commit", "-qm", "init");
    orig = process.cwd();
    process.chdir(cwd);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(async () => {
    process.chdir(orig);
    logSpy.mockRestore();
    await rm(cwd, { recursive: true, force: true });
  });

  it("reports a clean project", async () => {
    expect(await gapCommand({ _: [], "fail-on-gap": "true" })).toBe(0);
    expect(out()).toContain("the code matches the model");
  });

  it("turns a model-first move into a MOVE task from the last commit", async () => {
    await writeFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      model(
        "  - { id: invoices, kind: service, name: Invoices, description: x, sourcePath: src/billing/invoices, parentId: billing, status: proposed }",
      ),
    );
    expect(await gapCommand({ _: [], json: "true", "fail-on-gap": "true" })).toBe(1);
    const parsed = JSON.parse(out());
    expect(parsed.tasks).toEqual([
      expect.objectContaining({ type: "move-code", node: "invoices", from: "src/invoices", to: "src/billing/invoices" }),
    ]);
  });
});
