/**
 * Dogfood: concrete trace of archik's own `render` use case — run the
 * real `render` command on archik's diagram and record the run bound to
 * the render sequence diagram. The seq has 14 messages; this run records
 * the key ones, so validate reports the rest as informational.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderCommand } from "../cli/commands/render.ts";
import { trace } from "./recorder.ts";

const REPO = path.resolve(__dirname, "../..");

describe("dogfood: concrete trace of render/arch-svg", () => {
  const originalCwd = process.cwd();
  afterAll(() => process.chdir(originalCwd));

  it("runs the real render command and records a bound trace", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "archik-render-"));
    const out = path.join(outDir, "diagram.svg");
    process.chdir(REPO);

    let output = "";
    const logSpy = vi.spyOn(console, "log").mockImplementation((...a) => { output += a.join(" ") + "\n"; });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const code = await renderCommand({ _: [], out });

    logSpy.mockRestore();
    errSpy.mockRestore();
    process.chdir(originalCwd);

    expect(code).toBe(0);
    const m = output.match(/Rendered\s+(\d+)\s*nodes?\s*\/\s*(\d+)\s*edges?/i);
    const nodes = m ? Number(m[1]) : undefined;
    const edges = m ? Number(m[2]) : undefined;

    trace({
      useCase: "render",
      slice: "arch-svg",
      seqFile: ".archik/archik-render.archik.seq.yaml",
    })
      .step({ id: "resolve-path", from: "cmd", to: "resolve", label: "find .archik/main.archik.yaml", out: { path: ".archik/main.archik.yaml" } })
      .step({ id: "read-yaml", from: "cmd", to: "reader", label: "readFile + YAML.parse", out: { nodes, edges } })
      .step({ id: "validate", from: "cmd", to: "validator", label: "schema-validate the merged document", out: { ok: true } })
      .step({ id: "layout-call", from: "cmd", to: "layout-eng", label: "compute positions (ELK)", out: { positioned: nodes } })
      .step({ id: "render-call", from: "cmd", to: "svg", label: "React SSR → SVG markup", in: { nodes, edges } })
      .step({ id: "write-file", from: "cmd", to: "reader", label: "write self-contained SVG", out: { file: "diagram.svg", exitCode: code } })
      .flush();

    await rm(outDir, { recursive: true, force: true });
  });
});
