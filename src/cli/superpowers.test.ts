import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectSuperpowers } from "./superpowers.ts";

/**
 * detectSuperpowers reads a Claude Code home (~/.claude) and reports
 * whether the superpowers plugin is installed. Two evidence sources:
 *   1. plugins/installed_plugins.json — a `superpowers@<marketplace>` key
 *   2. plugins/cache/<marketplace>/superpowers/ — a cached install dir
 * Either one is enough; absence of both means not installed.
 */
describe("detectSuperpowers", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), "archik-home-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("returns false when no plugins dir exists", async () => {
    expect(await detectSuperpowers(home)).toBe(false);
  });

  it("detects via installed_plugins.json", async () => {
    const dir = path.join(home, ".claude/plugins");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "installed_plugins.json"),
      JSON.stringify({
        version: 2,
        plugins: {
          "superpowers@claude-plugins-official": [{ scope: "user" }],
          "context7@claude-plugins-official": [{ scope: "user" }],
        },
      }),
    );
    expect(await detectSuperpowers(home)).toBe(true);
  });

  it("detects via the cache directory when the manifest is absent", async () => {
    const dir = path.join(
      home,
      ".claude/plugins/cache/claude-plugins-official/superpowers/5.1.0",
    );
    await mkdir(dir, { recursive: true });
    expect(await detectSuperpowers(home)).toBe(true);
  });

  it("returns false when only unrelated plugins are present", async () => {
    const dir = path.join(home, ".claude/plugins");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "installed_plugins.json"),
      JSON.stringify({
        version: 2,
        plugins: { "context7@claude-plugins-official": [{ scope: "user" }] },
      }),
    );
    await mkdir(path.join(dir, "cache/claude-plugins-official/context7"), {
      recursive: true,
    });
    expect(await detectSuperpowers(home)).toBe(false);
  });

  it("tolerates a malformed manifest and falls back to the cache", async () => {
    const base = path.join(home, ".claude/plugins");
    await mkdir(base, { recursive: true });
    await writeFile(path.join(base, "installed_plugins.json"), "{not json");
    await mkdir(
      path.join(base, "cache/some-marketplace/superpowers"),
      { recursive: true },
    );
    expect(await detectSuperpowers(home)).toBe(true);
  });
});
