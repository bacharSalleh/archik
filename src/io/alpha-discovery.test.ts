import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverAlphaDoc } from "./alpha-discovery.ts";

const VALID_YAML = `
version: "1.0"
alphas:
  requirements:
    state: bounded
`.trim();

describe("discoverAlphaDoc", () => {
  let projectBase: string;

  beforeEach(async () => {
    projectBase = await mkdtemp(path.join(tmpdir(), "archik-alpha-discovery-"));
  });

  afterEach(async () => {
    await rm(projectBase, { recursive: true, force: true });
  });

  it("returns null doc when .archik does not exist", async () => {
    const result = await discoverAlphaDoc(projectBase);
    expect(result.doc).toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it("returns null doc when .archik exists but contains no alphas file", async () => {
    await mkdir(path.join(projectBase, ".archik"), { recursive: true });
    await writeFile(
      path.join(projectBase, ".archik/main.archik.yaml"),
      "hello",
    );
    const result = await discoverAlphaDoc(projectBase);
    expect(result.doc).toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it("loads the single alphas file", async () => {
    await mkdir(path.join(projectBase, ".archik"), { recursive: true });
    await writeFile(
      path.join(projectBase, ".archik/alphas.archik.alphas.yaml"),
      VALID_YAML,
    );
    const result = await discoverAlphaDoc(projectBase);
    expect(result.errors).toHaveLength(0);
    expect(result.doc?.relPath).toBe(".archik/alphas.archik.alphas.yaml");
    expect(result.doc?.doc.alphas.requirements?.state).toBe("bounded");
  });

  it("reports an error for invalid YAML", async () => {
    await mkdir(path.join(projectBase, ".archik"), { recursive: true });
    await writeFile(
      path.join(projectBase, ".archik/bad.archik.alphas.yaml"),
      ":\n  bad: [unclosed",
    );
    const result = await discoverAlphaDoc(projectBase);
    expect(result.doc).toBeNull();
    expect(result.errors).toHaveLength(1);
  });

  it("reports an error for schema-invalid YAML", async () => {
    await mkdir(path.join(projectBase, ".archik"), { recursive: true });
    await writeFile(
      path.join(projectBase, ".archik/x.archik.alphas.yaml"),
      `version: "1.0"\nalphas:\n  requirements:\n    state: ghost\n`,
    );
    const result = await discoverAlphaDoc(projectBase);
    expect(result.doc).toBeNull();
    expect(result.errors).toHaveLength(1);
  });

  it("flags additional alphas files as errors when more than one exists", async () => {
    await mkdir(path.join(projectBase, ".archik"), { recursive: true });
    await writeFile(
      path.join(projectBase, ".archik/a.archik.alphas.yaml"),
      VALID_YAML,
    );
    await writeFile(
      path.join(projectBase, ".archik/b.archik.alphas.yaml"),
      VALID_YAML,
    );
    const result = await discoverAlphaDoc(projectBase);
    expect(result.doc).not.toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toMatch(/multiple alphas files/);
  });
});
