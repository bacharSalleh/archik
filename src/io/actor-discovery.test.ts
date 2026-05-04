import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverActorDocs } from "./actor-discovery.ts";

const VALID_ACTORS_YAML = `
version: "1.0"
actors:
  - id: customer
    kind: human
    description: End-user buying products.
  - id: stripe
    kind: external-system
    description: Payment processor we integrate with.
`.trim();

describe("discoverActorDocs", () => {
  let projectBase: string;
  let archikDir: string;

  beforeEach(async () => {
    projectBase = await mkdtemp(path.join(tmpdir(), "archik-actor-discovery-"));
    archikDir = path.join(projectBase, ".archik");
  });

  afterEach(async () => {
    await rm(projectBase, { recursive: true, force: true });
  });

  it("returns empty result when .archik does not exist", async () => {
    const result = await discoverActorDocs(projectBase);
    expect(result.docs).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("loads a valid actors file at .archik root", async () => {
    await mkdir(archikDir, { recursive: true });
    await writeFile(
      path.join(archikDir, "actors.archik.actors.yaml"),
      VALID_ACTORS_YAML,
    );

    const result = await discoverActorDocs(projectBase);
    expect(result.errors).toHaveLength(0);
    expect(result.docs).toHaveLength(1);
    expect(result.docs[0]!.doc.actors).toHaveLength(2);
  });

  it("loads multiple actors files (across directories)", async () => {
    await mkdir(path.join(archikDir, "billing"), { recursive: true });
    await writeFile(
      path.join(archikDir, "people.archik.actors.yaml"),
      VALID_ACTORS_YAML,
    );
    await writeFile(
      path.join(archikDir, "billing", "systems.archik.actors.yaml"),
      `
version: "1.0"
actors:
  - id: ledger
    kind: external-system
    description: Accounting ledger we push journal entries to.
`.trim(),
    );

    const result = await discoverActorDocs(projectBase);
    expect(result.errors).toHaveLength(0);
    expect(result.docs).toHaveLength(2);
  });

  it("ignores other archik file types", async () => {
    await mkdir(archikDir, { recursive: true });
    await writeFile(path.join(archikDir, "main.archik.yaml"), "hello");
    await writeFile(path.join(archikDir, "flow.archik.seq.yaml"), "hello");

    const result = await discoverActorDocs(projectBase);
    expect(result.docs).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("reports an error for invalid YAML", async () => {
    await mkdir(archikDir, { recursive: true });
    await writeFile(
      path.join(archikDir, "bad.archik.actors.yaml"),
      ":\n  bad: [unclosed",
    );

    const result = await discoverActorDocs(projectBase);
    expect(result.docs).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it("reports an error for schema-invalid YAML", async () => {
    await mkdir(archikDir, { recursive: true });
    await writeFile(
      path.join(archikDir, "missing.archik.actors.yaml"),
      "version: \"1.0\"\n",
    );

    const result = await discoverActorDocs(projectBase);
    expect(result.docs).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});
