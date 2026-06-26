import { describe, expect, it, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(__dirname, "../..");

describe("archik/trace packaging", () => {
  beforeAll(() => {
    execFileSync("npm", ["run", "build"], { cwd: REPO, stdio: "ignore" });
  }, 120000);

  it("emits dist/trace.js and dist/trace.d.ts", () => {
    expect(existsSync(path.join(REPO, "dist/trace.js"))).toBe(true);
    expect(existsSync(path.join(REPO, "dist/trace.d.ts"))).toBe(true);
  });

  it("exposes ./trace in package.json exports", () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO, "package.json"), "utf-8"));
    expect(pkg.exports?.["./trace"]).toBeTruthy();
  });

  it("the built recorder writes a trace (smoke)", async () => {
    const mod = await import(path.join(REPO, "dist/trace.js"));
    expect(typeof mod.trace).toBe("function");
    const rec = mod.trace({ useCase: "x", slice: "y" });
    expect(typeof rec.step).toBe("function");
    expect(typeof rec.flush).toBe("function");
  });

  it("dist/trace.js stays zero runtime dependency (no zod / node_modules)", () => {
    const src = readFileSync(path.join(REPO, "dist/trace.js"), "utf-8");
    expect(src).not.toMatch(/zod/);
    expect(src).not.toMatch(/node_modules/);
  });
});
