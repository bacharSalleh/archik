import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverTraceDocs } from "./trace-discovery.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "archik-td-"));
  await mkdir(path.join(dir, ".archik", "traces"), { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const good = JSON.stringify({
  version: "1.0", useCase: "uc", slice: "s", recordedAt: "2026-06-26T00:00:00Z",
  steps: [{ from: "a", to: "b", label: "go" }],
});

describe("discoverTraceDocs", () => {
  it("finds and parses *.archik.trace.json", async () => {
    await writeFile(path.join(dir, ".archik/traces/uc.s.archik.trace.json"), good);
    const r = await discoverTraceDocs(dir);
    expect(r.docs).toHaveLength(1);
    expect(r.docs[0]!.doc.useCase).toBe("uc");
    expect(r.errors).toHaveLength(0);
  });

  it("collects parse errors without throwing", async () => {
    await writeFile(path.join(dir, ".archik/traces/bad.uc.s.archik.trace.json"), "{ not json");
    const r = await discoverTraceDocs(dir);
    expect(r.docs).toHaveLength(0);
    expect(r.errors).toHaveLength(1);
  });

  it("ignores non-trace json", async () => {
    await writeFile(path.join(dir, ".archik/traces/notes.json"), good);
    const r = await discoverTraceDocs(dir);
    expect(r.docs).toHaveLength(0);
  });
});
