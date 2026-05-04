import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverSeqDocs } from "./seq-discovery.ts";

const VALID_SEQ_YAML = `
version: "1.0"
name: Login Flow
participants:
  - id: p1
    nodeId: svc
steps: []
`.trim();

describe("discoverSeqDocs", () => {
  let projectBase: string;
  let archikDir: string;

  beforeEach(async () => {
    projectBase = await mkdtemp(path.join(tmpdir(), "archik-seq-discovery-"));
    archikDir = path.join(projectBase, ".archik");
  });

  afterEach(async () => {
    await rm(projectBase, { recursive: true, force: true });
  });

  it("returns empty result when .archik directory does not exist", async () => {
    // .archik dir is never created
    const result = await discoverSeqDocs(projectBase);
    expect(result.docs).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("loads a valid .archik.seq.yaml file", async () => {
    await mkdir(archikDir, { recursive: true });
    await writeFile(
      path.join(archikDir, "login.archik.seq.yaml"),
      VALID_SEQ_YAML,
    );

    const result = await discoverSeqDocs(projectBase);
    expect(result.errors).toHaveLength(0);
    expect(result.docs).toHaveLength(1);
    expect(result.docs[0]!.relPath).toBe(".archik/login.archik.seq.yaml");
    expect(result.docs[0]!.doc.name).toBe("Login Flow");
  });

  it("reports an error for an invalid YAML file", async () => {
    await mkdir(archikDir, { recursive: true });
    await writeFile(
      path.join(archikDir, "bad.archik.seq.yaml"),
      ":\n  bad: [unclosed",
    );

    const result = await discoverSeqDocs(projectBase);
    expect(result.docs).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.relPath).toBe(".archik/bad.archik.seq.yaml");
    expect(result.errors[0]!.message).toBeTruthy();
  });

  it("walks nested subdirectories under .archik (M6 fix A2)", async () => {
    await mkdir(path.join(archikDir, "seqs", "billing"), { recursive: true });
    await writeFile(
      path.join(archikDir, "seqs", "billing", "checkout.archik.seq.yaml"),
      VALID_SEQ_YAML,
    );
    const result = await discoverSeqDocs(projectBase);
    expect(result.errors).toHaveLength(0);
    expect(result.docs).toHaveLength(1);
    expect(result.docs[0]!.relPath).toBe(
      ".archik/seqs/billing/checkout.archik.seq.yaml",
    );
  });
});
