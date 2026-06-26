/**
 * Dogfood: capture a concrete trace of archik's own `drift` use case by
 * running the real `drift` command against archik's repo (which is clean)
 * and recording the run bound to the drift sequence diagram.
 */
import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import { driftCommand } from "../cli/commands/drift.ts";
import { trace } from "./recorder.ts";

const REPO = path.resolve(__dirname, "../..");

describe("dogfood: concrete trace of drift/clean", () => {
  it("runs the real drift command on archik's repo and records a bound trace", async () => {
    const originalCwd = process.cwd();
    process.chdir(REPO);

    let output = "";
    const logSpy = vi.spyOn(console, "log").mockImplementation((...a) => {
      output += a.join(" ") + "\n";
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const code = await driftCommand({ _: [] });

    logSpy.mockRestore();
    errSpy.mockRestore();
    process.chdir(originalCwd);

    expect(code).toBe(0); // archik's model is clean

    // Pull the real "<n> nodes / <m> tests on disk" counts out of the output.
    const m = output.match(/(\d+)\s*nodes?\s*\/\s*(\d+)\s*tests?/i);
    const nodes = m ? Number(m[1]) : undefined;
    const tests = m ? Number(m[2]) : undefined;

    trace({
      useCase: "drift",
      slice: "clean",
      seqFile: ".archik/drift.archik.seq.yaml",
    })
      .step({ id: "run-drift", from: "cli", to: "detector", label: "drift (load merged diagram)", in: { command: "archik drift" } })
      .step({ id: "stat-sources", from: "detector", to: "fs", label: "stat every node sourcePath + active slice test path", in: { checked: { nodes, tests } } })
      .step({ id: "paths-exist", from: "fs", to: "detector", label: "all paths resolve on disk", out: { allResolve: true } })
      .step({ id: "report-clean", from: "detector", to: "cli", label: "clean — exit 0", out: { exitCode: code, nodes, tests } })
      .flush();
  });
});
