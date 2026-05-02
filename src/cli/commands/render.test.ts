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
});
