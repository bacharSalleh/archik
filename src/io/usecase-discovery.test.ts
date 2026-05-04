import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverUseCaseDocs } from "./usecase-discovery.ts";

const VALID_UC_YAML = `
version: "1.0"
id: place-order
name: Place an order
primaryActor: customer
goal: Customer pays for cart and receives confirmation.
flows:
  basic:
    steps:
      - Submit cart
      - Charge payment
slices:
  - id: happy-path
    description: Cart valid; payment succeeds.
    flows: [basic]
    tests:
      - tests/happy.spec.ts
`.trim();

describe("discoverUseCaseDocs", () => {
  let projectBase: string;
  let usecasesDir: string;

  beforeEach(async () => {
    projectBase = await mkdtemp(path.join(tmpdir(), "archik-uc-discovery-"));
    usecasesDir = path.join(projectBase, ".archik", "usecases");
  });

  afterEach(async () => {
    await rm(projectBase, { recursive: true, force: true });
  });

  it("returns empty result when .archik/usecases does not exist", async () => {
    const result = await discoverUseCaseDocs(projectBase);
    expect(result.docs).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("loads a valid use case file", async () => {
    await mkdir(usecasesDir, { recursive: true });
    await writeFile(
      path.join(usecasesDir, "place-order.archik.uc.yaml"),
      VALID_UC_YAML,
    );

    const result = await discoverUseCaseDocs(projectBase);
    expect(result.errors).toHaveLength(0);
    expect(result.docs).toHaveLength(1);
    expect(result.docs[0]!.relPath).toBe(
      ".archik/usecases/place-order.archik.uc.yaml",
    );
    expect(result.docs[0]!.doc.id).toBe("place-order");
  });

  it("walks nested subdirectories under usecases", async () => {
    const billingDir = path.join(usecasesDir, "billing");
    await mkdir(billingDir, { recursive: true });
    await writeFile(
      path.join(billingDir, "place-order.archik.uc.yaml"),
      VALID_UC_YAML,
    );

    const result = await discoverUseCaseDocs(projectBase);
    expect(result.errors).toHaveLength(0);
    expect(result.docs).toHaveLength(1);
    expect(result.docs[0]!.relPath).toBe(
      ".archik/usecases/billing/place-order.archik.uc.yaml",
    );
  });

  it("ignores non-uc files in the usecases directory", async () => {
    await mkdir(usecasesDir, { recursive: true });
    await writeFile(path.join(usecasesDir, "README.md"), "# Use Cases");
    await writeFile(
      path.join(usecasesDir, "actors.archik.actors.yaml"),
      "version: \"1.0\"\nactors: []",
    );

    const result = await discoverUseCaseDocs(projectBase);
    expect(result.docs).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("reports an error for invalid YAML", async () => {
    await mkdir(usecasesDir, { recursive: true });
    await writeFile(
      path.join(usecasesDir, "bad.archik.uc.yaml"),
      ":\n  bad: [unclosed",
    );

    const result = await discoverUseCaseDocs(projectBase);
    expect(result.docs).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it("reports an error for schema-invalid YAML", async () => {
    await mkdir(usecasesDir, { recursive: true });
    await writeFile(
      path.join(usecasesDir, "missing-fields.archik.uc.yaml"),
      "version: \"1.0\"\nid: x\n",
    );

    const result = await discoverUseCaseDocs(projectBase);
    expect(result.docs).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});
