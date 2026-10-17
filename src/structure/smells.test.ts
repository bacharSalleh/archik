import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeSources, resolveImport, scanSmells, siblingPair } from "./smells.ts";

const src = (rel: string, text: string) => ({ rel, text });

describe("siblingPair", () => {
  it("maps an import to the sibling folders under the common parent", () => {
    expect(siblingPair("src/a/x.ts", "src/b/deep/y.ts")).toEqual({
      parent: "src",
      from: "src/a",
      to: "src/b",
    });
  });

  it("returns null when one side sits directly in the common folder", () => {
    expect(siblingPair("src/x.ts", "src/a/y.ts")).toBeNull();
    expect(siblingPair("src/a/y.ts", "src/x.ts")).toBeNull();
    expect(siblingPair("src/a/x.ts", "src/a/y.ts")).toBeNull();
  });

  it("uses the scan root as parent for top-level folders", () => {
    expect(siblingPair("a/x.ts", "b/y.ts")).toEqual({ parent: "", from: "a", to: "b" });
  });
});

describe("resolveImport", () => {
  const files = new Set(["src/a/x.ts", "src/b/index.ts", "src/c/y.tsx"]);

  it("resolves extensionless, .js-for-.ts and index imports", () => {
    expect(resolveImport("src/b/index.ts", "../a/x", files)).toBe("src/a/x.ts");
    expect(resolveImport("src/b/index.ts", "../a/x.js", files)).toBe("src/a/x.ts");
    expect(resolveImport("src/a/x.ts", "../b", files)).toBe("src/b/index.ts");
    expect(resolveImport("src/a/x.ts", "../c/y", files)).toBe("src/c/y.tsx");
  });

  it("ignores packages, aliases and paths that escape the root", () => {
    expect(resolveImport("src/a/x.ts", "react", files)).toBeNull();
    expect(resolveImport("src/a/x.ts", "@/b", files)).toBeNull();
    expect(resolveImport("src/a/x.ts", "../../../nope", files)).toBeNull();
  });
});

describe("analyzeSources", () => {
  it("reports a two-folder loop with import evidence", () => {
    const report = analyzeSources([
      src("src/a/x.ts", 'import { y } from "../b/y.ts";\n'),
      src("src/b/y.ts", 'import { x } from "../a/x.ts";\n'),
    ]);
    expect(report.folderLoops).toHaveLength(1);
    const loop = report.folderLoops[0]!;
    expect(loop.parent).toBe("src");
    expect(loop.folders).toEqual(["src/a", "src/b"]);
    expect(loop.directPairs).toEqual([["src/a", "src/b"]]);
    expect(loop.cheapestCuts).toHaveLength(2);
    expect(loop.edges).toEqual([
      { from: "src/a", to: "src/b", imports: 1, examples: [{ file: "src/a/x.ts", specifier: "../b/y.ts" }] },
      { from: "src/b", to: "src/a", imports: 1, examples: [{ file: "src/b/y.ts", specifier: "../a/x.ts" }] },
    ]);
  });

  it("finds a three-folder chain loop", () => {
    const report = analyzeSources([
      src("src/a/x.ts", 'import "../b/y";\n'),
      src("src/b/y.ts", 'import "../c/z";\n'),
      src("src/c/z.ts", 'import "../a/x";\n'),
    ]);
    expect(report.folderLoops.map((l) => l.folders)).toEqual([["src/a", "src/b", "src/c"]]);
    expect(report.folderLoops[0]!.directPairs).toEqual([]);
  });

  it("ranks the edge with the fewest imports as the cheapest cut", () => {
    const report = analyzeSources([
      src("src/a/x.ts", 'import "../b/y";\n'),
      src("src/a/w.ts", 'import "../b/y";\n'),
      src("src/b/y.ts", 'import "../a/x";\n'),
    ]);
    const cut = report.folderLoops[0]!.cheapestCuts[0]!;
    expect([cut.from, cut.to, cut.imports]).toEqual(["src/b", "src/a", 1]);
  });

  it("finds loops between nested sibling folders", () => {
    const report = analyzeSources([
      src("src/app/ui/x.ts", 'import "../core/y";\n'),
      src("src/app/core/y.ts", 'import "../ui/x";\n'),
    ]);
    expect(report.folderLoops[0]!.parent).toBe("src/app");
  });

  it("does not report one-way dependencies or parent/child imports", () => {
    const report = analyzeSources([
      src("src/a/x.ts", 'import "../b/y";\nimport "../shared";\n'),
      src("src/b/y.ts", 'import "../shared";\n'),
      src("src/shared.ts", 'import "./a/x";\n'),
    ]);
    expect(report.folderLoops).toEqual([]);
  });

  it("ignores imports that only appear in comments", () => {
    const report = analyzeSources([
      src("src/a/x.ts", 'import "../b/y";\n'),
      src("src/b/y.ts", '// import "../a/x";\n/* import "../a/x"; */\n'),
    ]);
    expect(report.folderLoops).toEqual([]);
  });

  it("flags files over the line limit, longest first", () => {
    const lines = (n: number) => "x\n".repeat(n);
    const report = analyzeSources(
      [src("a.ts", lines(5)), src("b.ts", lines(12)), src("c.ts", lines(20))],
      { maxFileLines: 10 },
    );
    expect(report.oversizedFiles.map((f) => [f.file, f.lines])).toEqual([
      ["c.ts", 20],
      ["b.ts", 12],
    ]);
    expect(report.summary).toEqual({ folderLoops: 0, oversizedFiles: 2, total: 2 });
  });
});

describe("scanSmells", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "archik-smells-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads the tree, skipping node_modules, dist and dot folders", async () => {
    await mkdir(path.join(root, "src/a"), { recursive: true });
    await mkdir(path.join(root, "src/b"), { recursive: true });
    await mkdir(path.join(root, "node_modules/pkg"), { recursive: true });
    await mkdir(path.join(root, ".cache"), { recursive: true });
    await writeFile(path.join(root, "src/a/x.ts"), 'import "../b/y";\n');
    await writeFile(path.join(root, "src/b/y.ts"), 'import "../a/x";\n');
    await writeFile(path.join(root, "node_modules/pkg/i.js"), "x\n".repeat(900));
    await writeFile(path.join(root, ".cache/c.js"), "x\n".repeat(900));
    const report = await scanSmells(root);
    expect(report.filesScanned).toBe(2);
    expect(report.folderLoops).toHaveLength(1);
    expect(report.oversizedFiles).toEqual([]);
  });
});
