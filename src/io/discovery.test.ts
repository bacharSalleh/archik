import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverDocs } from "./discovery.ts";

const minDoc = (name: string): string =>
  `version: "1.0"\nname: ${name}\nnodes: []\nedges: []\n`;

describe("discoverDocs", () => {
  let projectBase: string;
  let archikDir: string;
  let mainYaml: string;

  beforeEach(async () => {
    projectBase = await mkdtemp(path.join(tmpdir(), "archik-discovery-"));
    archikDir = path.join(projectBase, ".archik");
    mainYaml = path.join(archikDir, "main.archik.yaml");
    await mkdir(archikDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectBase, { recursive: true, force: true });
  });

  it("loads the root document", async () => {
    await writeFile(mainYaml, minDoc("Main"));
    const result = await discoverDocs(mainYaml, projectBase);
    expect(result.errors).toHaveLength(0);
    expect(result.docs).toHaveLength(1);
    expect(result.docs[0]!.doc.name).toBe("Main");
  });

  it("walks and loads additional .archik/*.archik.yaml files", async () => {
    await writeFile(mainYaml, minDoc("Main"));
    await writeFile(path.join(archikDir, "sub.archik.yaml"), minDoc("Sub"));
    const result = await discoverDocs(mainYaml, projectBase);
    expect(result.errors).toHaveLength(0);
    expect(result.docs).toHaveLength(2);
    const names = result.docs.map((d) => d.doc.name);
    expect(names).toContain("Main");
    expect(names).toContain("Sub");
  });

  it("skips .archik.suggested.yaml sidecars", async () => {
    await writeFile(mainYaml, minDoc("Main"));
    await writeFile(
      path.join(archikDir, "main.archik.suggested.yaml"),
      minDoc("Pending"),
    );
    const result = await discoverDocs(mainYaml, projectBase);
    expect(result.docs).toHaveLength(1);
    expect(result.docs[0]!.doc.name).toBe("Main");
  });

  it("deduplicates when the root path is also found by the walker", async () => {
    await writeFile(mainYaml, minDoc("Main"));
    // mainYaml is inside .archik/ so the walker would find it again —
    // the seen-set prevents a duplicate entry.
    const result = await discoverDocs(mainYaml, projectBase);
    expect(result.docs).toHaveLength(1);
  });

  it("reports parse errors non-fatally and loads the remaining files", async () => {
    await writeFile(mainYaml, minDoc("Main"));
    await writeFile(
      path.join(archikDir, "broken.archik.yaml"),
      ":\n  bad: [unclosed",
    );
    const result = await discoverDocs(mainYaml, projectBase);
    expect(result.docs).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.relPath).toContain("broken.archik.yaml");
  });

  it("reports a missing root file as an error instead of throwing", async () => {
    const missing = path.join(archikDir, "missing.archik.yaml");
    const result = await discoverDocs(missing, projectBase);
    expect(result.docs).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.relPath).toContain("missing.archik.yaml");
  });

  it("exposes relPath with forward slashes relative to projectBase", async () => {
    await writeFile(mainYaml, minDoc("Main"));
    const result = await discoverDocs(mainYaml, projectBase);
    expect(result.docs[0]!.relPath).toBe(".archik/main.archik.yaml");
  });
});
