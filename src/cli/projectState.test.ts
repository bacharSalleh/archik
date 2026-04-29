import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  projectStatePath,
  readProjectState,
  removeProjectState,
  runtimeStateFromDaemonState,
  writeProjectState,
} from "./projectState.ts";

/**
 * `.archik/runtime.json` is the project-local source of truth for
 * "is archik running here?". We pin: it always lives under the
 * project root's `.archik/` directory regardless of layout, the
 * write is atomic via rename, and corrupt / missing reads return
 * null cleanly.
 */
describe("projectState", () => {
  let cwd: string;
  let originalCwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-projstate-"));
    await mkdir(path.join(cwd, ".archik"));
    await writeFile(path.join(cwd, ".archik", "main.archik.yaml"), "");
    originalCwd = process.cwd();
    process.chdir(cwd);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(cwd, { recursive: true, force: true });
  });

  it("path is <project>/.archik/runtime.json under the new layout", () => {
    const docPath = path.join(cwd, ".archik", "main.archik.yaml");
    expect(projectStatePath(docPath)).toBe(
      path.join(cwd, ".archik", "runtime.json"),
    );
  });

  it("path is <project>/.archik/runtime.json even on legacy layout", async () => {
    // For architecture.archik.yaml at the project root, projectRoot
    // resolves to the doc's own directory; runtime.json still lives
    // under .archik/ — we create it on demand.
    const legacy = path.join(cwd, "architecture.archik.yaml");
    await writeFile(legacy, "");
    expect(projectStatePath(legacy)).toBe(
      path.join(cwd, ".archik", "runtime.json"),
    );
  });

  it("write + read round-trips a runtime entry", async () => {
    const docPath = path.join(cwd, ".archik", "main.archik.yaml");
    await writeProjectState(docPath, {
      pid: 12345,
      port: 5173,
      host: "127.0.0.1",
      url: "http://localhost:5173/",
      startedAt: "2026-04-29T10:00:00Z",
    });
    const read = await readProjectState(docPath);
    expect(read).toEqual({
      pid: 12345,
      port: 5173,
      host: "127.0.0.1",
      url: "http://localhost:5173/",
      startedAt: "2026-04-29T10:00:00Z",
    });
  });

  it("write creates .archik/ on the legacy layout if missing", async () => {
    // Simulate a legacy project — no .archik/ directory at all.
    const legacyRoot = await mkdtemp(path.join(tmpdir(), "archik-legacy-"));
    try {
      const legacy = path.join(legacyRoot, "architecture.archik.yaml");
      await writeFile(legacy, "");
      await writeProjectState(legacy, {
        pid: 1,
        port: 5173,
        host: "127.0.0.1",
        url: "http://localhost:5173/",
        startedAt: "2026-04-29T10:00:00Z",
      });
      const onDisk = await readFile(
        path.join(legacyRoot, ".archik", "runtime.json"),
        "utf-8",
      );
      expect(JSON.parse(onDisk).pid).toBe(1);
    } finally {
      await rm(legacyRoot, { recursive: true, force: true });
    }
  });

  it("read returns null when the file is missing", async () => {
    const docPath = path.join(cwd, ".archik", "main.archik.yaml");
    expect(await readProjectState(docPath)).toBeNull();
  });

  it("read returns null on malformed JSON", async () => {
    const docPath = path.join(cwd, ".archik", "main.archik.yaml");
    await writeFile(
      path.join(cwd, ".archik", "runtime.json"),
      "{not valid json",
    );
    expect(await readProjectState(docPath)).toBeNull();
  });

  it("read returns null when required fields are missing", async () => {
    const docPath = path.join(cwd, ".archik", "main.archik.yaml");
    // Missing `port` and `url`.
    await writeFile(
      path.join(cwd, ".archik", "runtime.json"),
      JSON.stringify({ pid: 1, host: "127.0.0.1" }),
    );
    expect(await readProjectState(docPath)).toBeNull();
  });

  it("remove deletes the file; subsequent read is null", async () => {
    const docPath = path.join(cwd, ".archik", "main.archik.yaml");
    await writeProjectState(docPath, {
      pid: 1,
      port: 5173,
      host: "127.0.0.1",
      url: "http://localhost:5173/",
      startedAt: "2026-04-29T10:00:00Z",
    });
    await removeProjectState(docPath);
    expect(await readProjectState(docPath)).toBeNull();
  });

  it("remove is idempotent — silent no-op when the file is already gone", async () => {
    const docPath = path.join(cwd, ".archik", "main.archik.yaml");
    await expect(removeProjectState(docPath)).resolves.toBeUndefined();
  });

  it("write overwrites an existing runtime file atomically", async () => {
    const docPath = path.join(cwd, ".archik", "main.archik.yaml");
    await writeProjectState(docPath, {
      pid: 1,
      port: 5173,
      host: "127.0.0.1",
      url: "http://localhost:5173/",
      startedAt: "2026-04-29T10:00:00Z",
    });
    await writeProjectState(docPath, {
      pid: 2,
      port: 5174,
      host: "127.0.0.1",
      url: "http://localhost:5174/",
      startedAt: "2026-04-29T11:00:00Z",
    });
    const read = await readProjectState(docPath);
    expect(read?.pid).toBe(2);
    expect(read?.port).toBe(5174);
  });
});

/**
 * Reconstruct a project-runtime entry from the tmpdir DaemonState. Used
 * when `runtime.json` was deleted out from under a running daemon (e.g.
 * `git clean -fdX` matching the gitignore line) — `archik status` heals
 * the gap by rebuilding the file from the canonical tmpdir state.
 *
 * The transform is pure: only deals with the field mapping and URL
 * parsing. The calling code in status.ts owns the alive-check and the
 * write-back to disk.
 */
describe("runtimeStateFromDaemonState", () => {
  const baseDaemon = {
    pid: 12345,
    docPath: "/tmp/proj/.archik/main.archik.yaml",
    logFile: "/tmp/log",
    startedAt: "2026-04-29T10:00:00Z",
    urls: { local: ["http://127.0.0.1:5173/"], network: [] },
  };

  it("maps daemon URL + pid + startedAt to a runtime entry", () => {
    expect(runtimeStateFromDaemonState(baseDaemon)).toEqual({
      pid: 12345,
      port: 5173,
      host: "127.0.0.1",
      url: "http://127.0.0.1:5173/",
      startedAt: "2026-04-29T10:00:00Z",
    });
  });

  it("parses port from a localhost URL", () => {
    const result = runtimeStateFromDaemonState({
      ...baseDaemon,
      urls: { local: ["http://localhost:4173/"], network: [] },
    });
    expect(result?.port).toBe(4173);
    expect(result?.host).toBe("localhost");
  });

  it("returns null when there is no local URL recorded", () => {
    expect(
      runtimeStateFromDaemonState({
        ...baseDaemon,
        urls: { local: [], network: [] },
      }),
    ).toBeNull();
  });

  it("returns null when the recorded URL is unparseable", () => {
    expect(
      runtimeStateFromDaemonState({
        ...baseDaemon,
        urls: { local: ["not a url"], network: [] },
      }),
    ).toBeNull();
  });

  it("returns null when the URL has no port", () => {
    // No explicit port and not http/https default — can't recover one.
    expect(
      runtimeStateFromDaemonState({
        ...baseDaemon,
        urls: { local: ["ftp://example/"], network: [] },
      }),
    ).toBeNull();
  });
});
