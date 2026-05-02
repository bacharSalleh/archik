import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pkgRoot } from "./paths.ts";

describe("pkgRoot", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env["ARCHIK_PKG_ROOT"];
    delete process.env["ARCHIK_PKG_ROOT"];
  });

  afterEach(() => {
    if (savedEnv !== undefined) {
      process.env["ARCHIK_PKG_ROOT"] = savedEnv;
    } else {
      delete process.env["ARCHIK_PKG_ROOT"];
    }
  });

  it("returns the resolved ARCHIK_PKG_ROOT when the env var is set", () => {
    process.env["ARCHIK_PKG_ROOT"] = "/custom/pkg/root";
    expect(pkgRoot()).toBe("/custom/pkg/root");
  });

  it("resolves a relative ARCHIK_PKG_ROOT against cwd", () => {
    process.env["ARCHIK_PKG_ROOT"] = "relative/path";
    expect(pkgRoot()).toBe(path.resolve("relative/path"));
  });

  it("walks up from the source file and finds the real package.json", () => {
    const root = pkgRoot();
    expect(existsSync(path.join(root, "package.json"))).toBe(true);
  });

  it("returned root contains a package.json with the archik package name", async () => {
    const root = pkgRoot();
    const pkg = await import(path.join(root, "package.json"), {
      with: { type: "json" },
    });
    expect(pkg.default.name).toBe("archik");
  });
});
