import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectFromList } from "./prompts.ts";

/**
 * Covers the numbered-fallback path of selectFromList (the arrow-key path
 * needs a raw-mode TTY and is smoke-tested manually). We swap process.stdin
 * for a non-TTY PassThrough so `setRawMode` is absent → the numbered path
 * runs — and assert it handles buffered + invalid input without dropping
 * lines (the bug a question()-loop had).
 */
describe("selectFromList — numbered fallback", () => {
  let origStdin: typeof process.stdin;

  beforeEach(() => {
    origStdin = process.stdin;
    // Silence the prompt's stdout writes during the test.
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    Object.defineProperty(process, "stdin", {
      value: origStdin,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  function pipeStdin(): PassThrough {
    const pt = new PassThrough();
    Object.defineProperty(process, "stdin", { value: pt, configurable: true });
    return pt;
  }

  const opts = [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
    { value: "c", label: "C" },
  ];

  it("resolves the selected option", async () => {
    const pt = pipeStdin();
    const p = selectFromList("pick", opts);
    pt.write("3\n");
    expect(await p).toBe("c");
  });

  it("re-prompts on out-of-range, then resolves", async () => {
    const pt = pipeStdin();
    const p = selectFromList("pick", opts);
    pt.write("0\n");
    pt.write("2\n");
    expect(await p).toBe("b");
  });

  it("re-prompts on non-numeric input, then resolves", async () => {
    const pt = pipeStdin();
    const p = selectFromList("pick", opts);
    pt.write("nope\n");
    pt.write("1\n");
    expect(await p).toBe("a");
  });
});
