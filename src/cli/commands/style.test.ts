import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { styleCommand } from "./style.ts";
import { validateCommand } from "./validate.ts";

const model = (edge: string) => `version: "1.0"
name: Shop
style:
  kind: layered
nodes:
  - id: web
    kind: frontend
    name: Web
    description: x
    layer: presentation
  - id: orders
    kind: module
    name: Orders
    description: x
    status: proposed
    layer: domain
  - id: misc
    kind: module
    name: Misc
    description: x
    status: proposed
edges:
${edge}
`;

describe("styleCommand", () => {
  let cwd: string;
  let orig: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  const out = (): string => logSpy.mock.calls.map((c) => c.join(" ")).join("\n");

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-style-"));
    await mkdir(path.join(cwd, ".archik"));
    orig = process.cwd();
    process.chdir(cwd);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(async () => {
    process.chdir(orig);
    logSpy.mockRestore();
    errSpy.mockRestore();
    await rm(cwd, { recursive: true, force: true });
  });

  it("shows the style, its rule, placement and hints", async () => {
    await writeFile(".archik/main.archik.yaml", model("  - { id: w-o, from: web, to: orders, relationship: uses }"));
    expect(await styleCommand({ _: [] })).toBe(0);
    const o = out();
    expect(o).toContain("Layered");
    expect(o).toContain("never above");
    expect(o).toMatch(/presentation\s+web/);
    expect(o).toContain("misc");
    expect(o).toContain("follows the layered style");
  });

  it("validate fails on an upward dependency", async () => {
    await writeFile(".archik/main.archik.yaml", model("  - { id: o-w, from: orders, to: web, relationship: uses }"));
    expect(await validateCommand({ _: [] })).toBe(1);
    const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(err).toContain("`orders` (domain) depends on `web` (presentation)");
  });

  it("lists every style with YAML", async () => {
    expect(await styleCommand({ _: ["list"], json: "true" })).toBe(0);
    const parsed = JSON.parse(out());
    expect(parsed.styles.map((s: { kind: string }) => s.kind)).toEqual([
      "layered",
      "hexagonal",
      "clean",
      "modular-monolith",
      "feature-slices",
    ]);
    expect(parsed.styles[0].yaml).toContain("kind: layered");
  });
});
