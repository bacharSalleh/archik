import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import YAML from "yaml";
import { suggestCommand } from "./suggest.ts";

/**
 * Coverage for the `archik suggest set` verb. The CLI is the only
 * sanctioned writer of the sidecar — these tests pin the
 * preconditions (draft path required, refusal of the main file,
 * schema/cross-file validation) and the postcondition (sidecar
 * lands at the canonical path with a fresh `metadata.suggestion`
 * stamp).
 */
const draftBody = `
version: "1.0"
name: Suggest Test
nodes:
  - id: api
    kind: service
    name: API
    description: HTTP API for orders
    sourcePath: src/api
  - id: db
    kind: database
    name: DB
    description: Postgres database for orders
edges:
  - id: api-db
    from: api
    to: db
    relationship: writes
`.trimStart();

const mainBody = `
version: "1.0"
name: Suggest Test
nodes:
  - id: api
    kind: service
    name: API
    description: HTTP API for orders
    sourcePath: src/api
edges: []
`.trimStart();

describe("suggestCommand set", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-suggest-set-"));
    await mkdir(path.join(cwd, ".archik"));
    // The strict sourcePath rule resolves paths relative to the
    // project root and requires they exist on disk. Create the
    // directory the fixture references so suggest set can stage
    // the draft.
    await mkdir(path.join(cwd, "src/api"), { recursive: true });
    await writeFile(path.join(cwd, ".archik/main.archik.yaml"), mainBody);
    originalCwd = process.cwd();
    process.chdir(cwd);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    logSpy.mockRestore();
    errSpy.mockRestore();
    await rm(cwd, { recursive: true, force: true });
  });

  it("stages a valid draft as the sidecar with a stamped metadata.suggestion", async () => {
    const draft = path.join(cwd, "draft.yaml");
    await writeFile(draft, draftBody);

    const code = await suggestCommand({
      _: ["set", "draft.yaml"],
      note: "add db",
    });

    expect(code).toBe(0);
    const sidecar = path.join(cwd, ".archik/main.archik.suggested.yaml");
    const written = YAML.parse(await readFile(sidecar, "utf-8"));
    expect(written.nodes).toHaveLength(2);
    expect(written.edges).toHaveLength(1);
    expect(written.metadata.suggestion.from).toContain("main.archik.yaml");
    expect(written.metadata.suggestion.note).toBe("add db");
    // `at` is a fresh ISO timestamp — just confirm it parses.
    expect(() => new Date(written.metadata.suggestion.at)).not.toThrow();
  });

  it("refuses when no draft path is given", async () => {
    const code = await suggestCommand({ _: ["set"] });
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("Missing draft path"),
    );
  });

  it("refuses to use the main file as the draft", async () => {
    const code = await suggestCommand({
      _: ["set", ".archik/main.archik.yaml"],
    });
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("Refusing to use the main file"),
    );
  });

  it("rejects an invalid draft and does not write the sidecar", async () => {
    const draft = path.join(cwd, "draft.yaml");
    await writeFile(draft, "version: not-1.0\nname: x\nnodes: []\nedges: []\n");

    const code = await suggestCommand({ _: ["set", "draft.yaml"] });

    expect(code).toBe(1);
    // Sidecar must not have been written on a failed validation.
    await expect(
      readFile(path.join(cwd, ".archik/main.archik.suggested.yaml"), "utf-8"),
    ).rejects.toThrow();
  });

  it("rejects a draft with cross-file references that don't resolve", async () => {
    const draft = path.join(cwd, "draft.yaml");
    await writeFile(
      draft,
      `
version: "1.0"
name: Suggest Test
nodes:
  - id: api
    kind: service
    name: API
    description: HTTP API for orders
    sourcePath: src/api
    archikFile: .archik/missing.archik.yaml
edges: []
`.trimStart(),
    );

    const code = await suggestCommand({ _: ["set", "draft.yaml"] });

    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("Draft references missing files"),
    );
  });

  it("reads the draft from stdin when path is '-'", async () => {
    const originalStdin = process.stdin;
    // Replace stdin with a readable that yields the draft body.
    Object.defineProperty(process, "stdin", {
      value: Readable.from([draftBody]),
      configurable: true,
    });
    try {
      const code = await suggestCommand({ _: ["set", "-"], note: "stdin" });
      expect(code).toBe(0);
      const sidecar = path.join(cwd, ".archik/main.archik.suggested.yaml");
      const written = YAML.parse(await readFile(sidecar, "utf-8"));
      expect(written.metadata.suggestion.note).toBe("stdin");
      expect(written.nodes).toHaveLength(2);
    } finally {
      Object.defineProperty(process, "stdin", {
        value: originalStdin,
        configurable: true,
      });
    }
  });

  it("emits structured JSON on success when --json is set", async () => {
    const draft = path.join(cwd, "draft.yaml");
    await writeFile(draft, draftBody);

    const code = await suggestCommand({
      _: ["set", "draft.yaml"],
      json: "true",
      note: "json mode",
    });

    expect(code).toBe(0);
    const lastCall = logSpy.mock.calls.at(-1);
    expect(lastCall).toBeTruthy();
    const parsed = JSON.parse(lastCall![0] as string);
    expect(parsed).toMatchObject({
      ok: true,
      note: "json mode",
      nodes: 2,
      edges: 1,
    });
  });

  it("rejects an unknown subcommand with exit 1", async () => {
    const code = await suggestCommand({ _: ["bogus"] });
    expect(code).toBe(1);
  });

  it("refuses to write an orphan sidecar without --allow-orphan", async () => {
    // No `.archik/memory.archik.yaml` on disk — staging a sidecar
    // for it without opt-in is the bug the guardrail catches.
    const draft = path.join(cwd, "draft.yaml");
    await writeFile(draft, draftBody);

    const code = await suggestCommand({
      _: ["set", "draft.yaml"],
      main: ".archik/memory.archik.yaml",
    });

    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("Main file"),
    );
    // Sidecar must not have been written.
    await expect(
      readFile(path.join(cwd, ".archik/memory.archik.suggested.yaml"), "utf-8"),
    ).rejects.toThrow();
  });

  it("writes an orphan sidecar when --allow-orphan is set", async () => {
    const draft = path.join(cwd, "draft.yaml");
    await writeFile(draft, draftBody);

    const code = await suggestCommand({
      _: ["set", "draft.yaml"],
      main: ".archik/memory.archik.yaml",
      "allow-orphan": "true",
      note: "new sub-architecture",
    });

    expect(code).toBe(0);
    const sidecar = path.join(cwd, ".archik/memory.archik.suggested.yaml");
    const written = YAML.parse(await readFile(sidecar, "utf-8"));
    expect(written.metadata.suggestion.note).toBe("new sub-architecture");
    // The implied target main file does not exist.
    await expect(
      readFile(path.join(cwd, ".archik/memory.archik.yaml"), "utf-8"),
    ).rejects.toThrow();
  });
});

describe("suggestCommand show", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-suggest-show-"));
    await mkdir(path.join(cwd, ".archik"));
    await mkdir(path.join(cwd, "src/api"), { recursive: true });
    await writeFile(path.join(cwd, ".archik/main.archik.yaml"), mainBody);
    originalCwd = process.cwd();
    process.chdir(cwd);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    logSpy.mockRestore();
    errSpy.mockRestore();
    await rm(cwd, { recursive: true, force: true });
  });

  it("returns 0 and reports no pending suggestion when no sidecar exists", async () => {
    const code = await suggestCommand({ _: ["show"] });
    expect(code).toBe(0);
    const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toMatch(/no pending/i);
  });

  it("emits JSON with pending: false when no sidecar exists", async () => {
    const code = await suggestCommand({ _: ["show"], json: "true" });
    expect(code).toBe(0);
    const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.pending).toBe(false);
  });

  it("returns 0 and summarises the sidecar when one exists", async () => {
    const draft = path.join(cwd, "draft.yaml");
    await writeFile(draft, draftBody);
    await suggestCommand({ _: ["set", "draft.yaml"], note: "add db" });
    logSpy.mockClear();

    const code = await suggestCommand({ _: ["show"] });
    expect(code).toBe(0);
    const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toMatch(/add db/i);
    expect(out).toMatch(/suggestion/i);
  });

  it("emits structured JSON with ok, pending, suggestion.note when --json is set", async () => {
    const draft = path.join(cwd, "draft.yaml");
    await writeFile(draft, draftBody);
    await suggestCommand({ _: ["set", "draft.yaml"], note: "add db" });
    logSpy.mockClear();

    const code = await suggestCommand({ _: ["show"], json: "true" });
    expect(code).toBe(0);
    const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.pending).toBe(true);
    expect(parsed.suggestion.note).toBe("add db");
    expect(typeof parsed.totals).toBe("object");
  });

  it("show is the default subcommand (no subcommand arg)", async () => {
    const code = await suggestCommand({ _: [] });
    expect(code).toBe(0);
    const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toMatch(/no pending/i);
  });
});

describe("suggestCommand accept", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-suggest-accept-"));
    await mkdir(path.join(cwd, ".archik"));
    await mkdir(path.join(cwd, "src/api"), { recursive: true });
    await writeFile(path.join(cwd, ".archik/main.archik.yaml"), mainBody);
    originalCwd = process.cwd();
    process.chdir(cwd);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    logSpy.mockRestore();
    errSpy.mockRestore();
    await rm(cwd, { recursive: true, force: true });
  });

  it("returns 1 when there is no sidecar to accept", async () => {
    const code = await suggestCommand({ _: ["accept"] });
    expect(code).toBe(1);
    const err = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(err).toMatch(/no suggestion/i);
  });

  it("overwrites main with the sidecar content and deletes the sidecar", async () => {
    const draft = path.join(cwd, "draft.yaml");
    await writeFile(draft, draftBody);
    await suggestCommand({ _: ["set", "draft.yaml"], note: "add db" });
    logSpy.mockClear();

    const code = await suggestCommand({ _: ["accept"] });
    expect(code).toBe(0);

    // Main file now has db node
    const main = YAML.parse(
      await readFile(path.join(cwd, ".archik/main.archik.yaml"), "utf-8"),
    );
    expect(main.nodes).toHaveLength(2);
    expect(main.nodes.find((n: { id: string }) => n.id === "db")).toBeTruthy();

    // Sidecar is gone
    await expect(
      readFile(path.join(cwd, ".archik/main.archik.suggested.yaml"), "utf-8"),
    ).rejects.toThrow();
  });

  it("strips metadata.suggestion from the accepted file", async () => {
    const draft = path.join(cwd, "draft.yaml");
    await writeFile(draft, draftBody);
    await suggestCommand({ _: ["set", "draft.yaml"], note: "add db" });
    logSpy.mockClear();

    await suggestCommand({ _: ["accept"] });
    const main = YAML.parse(
      await readFile(path.join(cwd, ".archik/main.archik.yaml"), "utf-8"),
    );
    expect(main.metadata?.suggestion).toBeUndefined();
  });

  it("logs a success message after accepting", async () => {
    const draft = path.join(cwd, "draft.yaml");
    await writeFile(draft, draftBody);
    await suggestCommand({ _: ["set", "draft.yaml"] });
    logSpy.mockClear();

    await suggestCommand({ _: ["accept"] });
    const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toMatch(/accepted/i);
    expect(out).toContain("main.archik.yaml");
  });
});

describe("suggestCommand reject", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-suggest-reject-"));
    await mkdir(path.join(cwd, ".archik"));
    await mkdir(path.join(cwd, "src/api"), { recursive: true });
    await writeFile(path.join(cwd, ".archik/main.archik.yaml"), mainBody);
    originalCwd = process.cwd();
    process.chdir(cwd);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    logSpy.mockRestore();
    errSpy.mockRestore();
    await rm(cwd, { recursive: true, force: true });
  });

  it("returns 0 and notes nothing to reject when no sidecar exists", async () => {
    const code = await suggestCommand({ _: ["reject"] });
    expect(code).toBe(0);
    const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toMatch(/nothing to reject/i);
  });

  it("deletes the sidecar and returns 0", async () => {
    const draft = path.join(cwd, "draft.yaml");
    await writeFile(draft, draftBody);
    await suggestCommand({ _: ["set", "draft.yaml"] });
    logSpy.mockClear();

    const code = await suggestCommand({ _: ["reject"] });
    expect(code).toBe(0);

    await expect(
      readFile(path.join(cwd, ".archik/main.archik.suggested.yaml"), "utf-8"),
    ).rejects.toThrow();
  });

  it("does not modify the main file when rejecting", async () => {
    const originalMain = await readFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      "utf-8",
    );
    const draft = path.join(cwd, "draft.yaml");
    await writeFile(draft, draftBody);
    await suggestCommand({ _: ["set", "draft.yaml"] });
    logSpy.mockClear();

    await suggestCommand({ _: ["reject"] });
    const afterMain = await readFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      "utf-8",
    );
    expect(afterMain).toBe(originalMain);
  });

  it("logs a success message after rejecting", async () => {
    const draft = path.join(cwd, "draft.yaml");
    await writeFile(draft, draftBody);
    await suggestCommand({ _: ["set", "draft.yaml"] });
    logSpy.mockClear();

    await suggestCommand({ _: ["reject"] });
    const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toMatch(/rejected/i);
  });
});
