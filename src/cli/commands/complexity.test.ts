import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const REPO = path.resolve(__dirname, "../../..");
const CLI = path.join(REPO, "src/cli/index.ts");

async function archik(cwd: string, args: string[]) {
  try {
    const { stdout } = await run("npx", ["tsx", "--tsconfig", path.join(REPO, "tsconfig.app.json"), CLI, ...args], { cwd });
    return { code: 0, stdout };
  } catch (err: any) {
    return { code: err.code ?? 1, stdout: err.stdout ?? "" };
  }
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "archik-cx-"));
  await mkdir(path.join(dir, ".archik"), { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function bigDoc(nodeCount: number): string {
  const nodes = Array.from({ length: nodeCount }, (_, i) =>
    `  - { id: n${i}, kind: external, name: n${i}, description: "node ${i}" }`,
  ).join("\n");
  return `version: "1.0"\nname: Big\nnodes:\n${nodes}\nedges: []\n`;
}

describe("archik complexity", () => {
  it("exits 0 and prints hints but does not fail by default", async () => {
    await writeFile(path.join(dir, ".archik/main.archik.yaml"), bigDoc(40));
    const r = await archik(dir, ["complexity"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("archikFile");
  });

  it("exits 1 with --fail-on-warn when findings exist", async () => {
    await writeFile(path.join(dir, ".archik/main.archik.yaml"), bigDoc(40));
    const r = await archik(dir, ["complexity", "--fail-on-warn"]);
    expect(r.code).toBe(1);
  });

  it("exits 0 cleanly on a small model", async () => {
    await writeFile(path.join(dir, ".archik/main.archik.yaml"), bigDoc(3));
    const r = await archik(dir, ["complexity", "--fail-on-warn"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("no complexity hints");
  });

  it("honors --max-nodes override", async () => {
    await writeFile(path.join(dir, ".archik/main.archik.yaml"), bigDoc(10));
    const strict = await archik(dir, ["complexity", "--max-nodes", "5", "--fail-on-warn"]);
    expect(strict.code).toBe(1);
    const loose = await archik(dir, ["complexity", "--max-nodes", "50"]);
    expect(loose.stdout).toContain("no complexity hints");
  });

  it("emits json with --json", async () => {
    await writeFile(path.join(dir, ".archik/main.archik.yaml"), bigDoc(40));
    const r = await archik(dir, ["complexity", "--json"]);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.findings.length).toBeGreaterThan(0);
  });
});
