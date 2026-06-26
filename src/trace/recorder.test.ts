import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { trace } from "./recorder.ts";

let dir: string;
let prevCwd: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "archik-trace-"));
  await mkdir(path.join(dir, ".archik"), { recursive: true });
  prevCwd = process.cwd();
  process.chdir(dir);
});
afterEach(async () => {
  process.chdir(prevCwd);
  await rm(dir, { recursive: true, force: true });
});

async function readTrace(useCase: string, slice: string) {
  const p = path.join(dir, ".archik", "traces", `${useCase}.${slice}.archik.trace.json`);
  return JSON.parse(await readFile(p, "utf-8"));
}

describe("trace recorder", () => {
  it("writes a valid trace file with recorded steps on flush", async () => {
    trace({ useCase: "place-order", slice: "happy" })
      .step({ id: "m1", from: "browser", to: "api", label: "POST /login", in: { e: "a@x" }, out: { token: "t" } })
      .step({ from: "api", to: "db", label: "insert", in: { id: 1 } })
      .flush();
    const doc = await readTrace("place-order", "happy");
    expect(doc.version).toBe("1.0");
    expect(doc.useCase).toBe("place-order");
    expect(doc.slice).toBe("happy");
    expect(typeof doc.recordedAt).toBe("string");
    expect(doc.steps).toHaveLength(2);
    expect(doc.steps[0]).toMatchObject({ id: "m1", from: "browser", to: "api", label: "POST /login", data: { in: { e: "a@x" }, out: { token: "t" } } });
    expect(doc.steps[1]).toMatchObject({ from: "api", to: "db", data: { in: { id: 1 } } });
  });

  it("records seqFile when provided", async () => {
    trace({ useCase: "uc", slice: "s", seqFile: ".archik/x.archik.seq.yaml" })
      .step({ from: "a", to: "b", label: "go" })
      .flush();
    expect((await readTrace("uc", "s")).seqFile).toBe(".archik/x.archik.seq.yaml");
  });

  it("flush is idempotent (second flush does not throw or duplicate)", async () => {
    const t = trace({ useCase: "uc", slice: "s" }).step({ from: "a", to: "b", label: "go" });
    t.flush();
    t.flush();
    expect((await readTrace("uc", "s")).steps).toHaveLength(1);
  });

  it("marks a step status error when passed", async () => {
    trace({ useCase: "uc", slice: "s" }).step({ from: "a", to: "b", label: "x", status: "error" }).flush();
    expect((await readTrace("uc", "s")).steps[0].status).toBe("error");
  });

  it("walks up to find .archik from a nested cwd", async () => {
    const nested = path.join(dir, "src", "deep");
    await mkdir(nested, { recursive: true });
    process.chdir(nested);
    trace({ useCase: "uc", slice: "s" }).step({ from: "a", to: "b", label: "x" }).flush();
    // file lands under the project's .archik, not the nested dir
    const doc = await readTrace("uc", "s");
    expect(doc.steps).toHaveLength(1);
  });

  it("removes its exit listener on flush (no listener accumulation)", () => {
    const before = process.listenerCount("exit");
    for (let i = 0; i < 15; i++) {
      trace({ useCase: "uc", slice: `s${i}` }).step({ from: "a", to: "b", label: "x" }).flush();
    }
    expect(process.listenerCount("exit")).toBe(before);
  });
});
