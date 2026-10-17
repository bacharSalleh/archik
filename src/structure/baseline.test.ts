import { describe, expect, it } from "vitest";
import { analyzeSources } from "./smells.ts";
import { compareToBaseline, makeBaseline, parseBaseline } from "./baseline.ts";

const src = (rel: string, text: string) => ({ rel, text });
const lines = (n: number) => "x\n".repeat(n);
const limits = { maxFileLines: 10 };

const today = analyzeSources(
  [
    src("src/a/x.ts", 'import "../b/y";\n'),
    src("src/b/y.ts", 'import "../a/x";\n'),
    src("big.ts", lines(20)),
  ],
  limits,
);

describe("makeBaseline / parseBaseline", () => {
  it("records loops by folder set and oversized files by line count", () => {
    const b = makeBaseline(today, new Date("2026-10-17T00:00:00Z"));
    expect(b).toEqual({
      version: 1,
      createdAt: "2026-10-17T00:00:00.000Z",
      folderLoops: [["src/a", "src/b"]],
      oversizedFiles: [{ file: "big.ts", lines: 20 }],
    });
    expect(parseBaseline(JSON.stringify(b))).toEqual(b);
  });

  it("rejects a malformed baseline", () => {
    expect(() => parseBaseline('{"version":2}')).toThrow(/baseline/i);
    expect(() => parseBaseline("not json")).toThrow(/baseline/i);
  });
});

describe("compareToBaseline", () => {
  const baseline = makeBaseline(today);

  it("finds nothing new when the code has not changed", () => {
    const c = compareToBaseline(today, baseline);
    expect(c.newLoops).toEqual([]);
    expect(c.newOversizedFiles).toEqual([]);
    expect(c.fixedLoops).toEqual([]);
    expect(c.fixedFiles).toEqual([]);
  });

  it("flags a new loop, a new oversized file and a file that grew", () => {
    const later = analyzeSources(
      [
        src("src/a/x.ts", 'import "../b/y";\n'),
        src("src/b/y.ts", 'import "../a/x";\n'),
        src("src/c/p.ts", 'import "../d/q";\n'),
        src("src/d/q.ts", 'import "../c/p";\n'),
        src("big.ts", lines(25)),
        src("huge.ts", lines(30)),
      ],
      limits,
    );
    const c = compareToBaseline(later, baseline);
    expect(c.newLoops.map((l) => l.folders)).toEqual([["src/c", "src/d"]]);
    expect(c.newOversizedFiles.map((f) => [f.file, f.lines])).toEqual([
      ["huge.ts", 30],
      ["big.ts", 25],
    ]);
  });

  it("treats a loop that pulled in another folder as new", () => {
    const later = analyzeSources([
      src("src/a/x.ts", 'import "../b/y";\n'),
      src("src/b/y.ts", 'import "../c/z";\n'),
      src("src/c/z.ts", 'import "../a/x";\n'),
    ], limits);
    const c = compareToBaseline(later, baseline);
    expect(c.newLoops.map((l) => l.folders)).toEqual([["src/a", "src/b", "src/c"]]);
    expect(c.fixedLoops).toEqual([["src/a", "src/b"]]);
  });

  it("reports what was fixed", () => {
    const later = analyzeSources([src("big.ts", lines(5))], limits);
    const c = compareToBaseline(later, baseline);
    expect(c.fixedLoops).toEqual([["src/a", "src/b"]]);
    expect(c.fixedFiles).toEqual(["big.ts"]);
  });
});
