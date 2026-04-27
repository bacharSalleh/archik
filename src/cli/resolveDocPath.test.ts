import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LEGACY_DEFAULT_REL,
  NEW_DEFAULT_REL,
  projectRoot,
  resolveDocPath,
  resolveInitTarget,
} from "./resolveDocPath.ts";

describe("resolveDocPath", () => {
  let cwd: string;
  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-resolve-"));
  });
  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("uses an explicit path verbatim, ignoring conventions", async () => {
    await writeFile(path.join(cwd, "custom.yaml"), "");
    const out = await resolveDocPath("custom.yaml", cwd);
    expect(out).toBe(path.join(cwd, "custom.yaml"));
  });

  it("returns the legacy root file when only it exists", async () => {
    await writeFile(path.join(cwd, LEGACY_DEFAULT_REL), "");
    const out = await resolveDocPath(undefined, cwd);
    expect(out).toBe(path.join(cwd, LEGACY_DEFAULT_REL));
  });

  it("returns the new .archik/ path when only it exists", async () => {
    await mkdir(path.join(cwd, ".archik"));
    await writeFile(path.join(cwd, NEW_DEFAULT_REL), "");
    const out = await resolveDocPath(undefined, cwd);
    expect(out).toBe(path.join(cwd, NEW_DEFAULT_REL));
  });

  it("defaults to the new .archik/ path when neither exists", async () => {
    const out = await resolveDocPath(undefined, cwd);
    expect(out).toBe(path.join(cwd, NEW_DEFAULT_REL));
  });

  it("throws when both legacy and new files exist", async () => {
    await writeFile(path.join(cwd, LEGACY_DEFAULT_REL), "");
    await mkdir(path.join(cwd, ".archik"));
    await writeFile(path.join(cwd, NEW_DEFAULT_REL), "");
    await expect(resolveDocPath(undefined, cwd)).rejects.toThrow(
      /both .* pick one/i,
    );
  });
});

describe("resolveInitTarget", () => {
  let cwd: string;
  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-init-"));
  });
  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("targets the new .archik/ path on a clean cwd", async () => {
    const out = await resolveInitTarget(undefined, cwd);
    expect(out).toBe(path.join(cwd, NEW_DEFAULT_REL));
  });

  it("targets the legacy root file if it already exists (so refusal is obvious)", async () => {
    await writeFile(path.join(cwd, LEGACY_DEFAULT_REL), "");
    const out = await resolveInitTarget(undefined, cwd);
    expect(out).toBe(path.join(cwd, LEGACY_DEFAULT_REL));
  });

  it("uses an explicit path when given", async () => {
    const out = await resolveInitTarget("docs/arch.yaml", cwd);
    expect(out).toBe(path.join(cwd, "docs/arch.yaml"));
  });
});

describe("projectRoot", () => {
  it("returns the doc's directory for the legacy root layout", () => {
    expect(projectRoot("/p/architecture.archik.yaml")).toBe("/p");
  });

  it("returns the parent of .archik/ for the new layout", () => {
    expect(projectRoot("/p/.archik/main.archik.yaml")).toBe("/p");
  });

  it("handles arbitrary names inside .archik/", () => {
    expect(projectRoot("/p/.archik/orders.archik.yaml")).toBe("/p");
  });
});
