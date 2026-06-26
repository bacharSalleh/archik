/**
 * Dogfood: archik captures a CONCRETE trace of its own `suggest-accept`
 * use case by running the real suggest→accept flow and recording each
 * step's real data, bound to the slice's sequence diagram. The trace is
 * written into archik's own `.archik/traces/` so the canvas shows a
 * concrete run on the suggest-accept/happy slice.
 *
 * The recorder resolves the project root at flush time, so we run the
 * flow inside a temp project (chdir away) but flush back at the repo root
 * — the trace lands in archik's repo, not the temp dir.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";
import { suggestCommand } from "../cli/commands/suggest.ts";
import { trace } from "./recorder.ts";

const REPO = path.resolve(__dirname, "../..");

const mainBody = `version: "1.0"
name: Demo
nodes:
  - id: api
    kind: service
    name: API
    description: Public API service handling customer requests.
    sourcePath: src/api
edges: []
`;

const draftBody = `version: "1.0"
name: Demo
nodes:
  - id: api
    kind: service
    name: API
    description: Public API service handling customer requests.
    sourcePath: src/api
  - id: orders-db
    kind: database
    name: Orders DB
    description: Stores orders written by the API.
edges:
  - id: api-writes-db
    from: api
    to: orders-db
    relationship: writes
`;

describe("dogfood: concrete trace of suggest-accept/happy", () => {
  const originalCwd = process.cwd();
  afterAll(() => process.chdir(originalCwd));

  it("runs the real suggest→accept flow and records a bound trace", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "archik-dogfood-"));
    await mkdir(path.join(cwd, ".archik"), { recursive: true });
    await mkdir(path.join(cwd, "src/api"), { recursive: true });
    await writeFile(path.join(cwd, ".archik/main.archik.yaml"), mainBody);
    await writeFile(path.join(cwd, "draft.yaml"), draftBody);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.chdir(cwd);

    // 1. read the current document (real)
    const currentMain = YAML.parse(
      await readFile(path.join(cwd, ".archik/main.archik.yaml"), "utf-8"),
    );

    // 2. stage the proposed change as a sidecar (real suggest set)
    const setCode = await suggestCommand({ _: ["set", "draft.yaml"], note: "add orders-db" });
    const sidecar = YAML.parse(
      await readFile(path.join(cwd, ".archik/main.archik.suggested.yaml"), "utf-8"),
    );

    // 3. accept → sidecar merged into main, sidecar deleted (real accept)
    const acceptCode = await suggestCommand({ _: ["accept"] });
    const promoted = YAML.parse(
      await readFile(path.join(cwd, ".archik/main.archik.yaml"), "utf-8"),
    );

    process.chdir(REPO);
    logSpy.mockRestore();
    errSpy.mockRestore();

    expect(setCode).toBe(0);
    expect(acceptCode).toBe(0);
    expect(promoted.nodes.map((n: { id: string }) => n.id)).toContain("orders-db");

    // Record the concrete run, bound to the seq diagram by message id.
    // Steps the CLI doesn't exercise (watcher/canvas SSE) are simply
    // omitted — validate reports those as informational, not errors.
    trace({
      useCase: "suggest-accept",
      slice: "happy",
      seqFile: ".archik/archik-suggest-accept.archik.seq.yaml",
    })
      .step({
        id: "read-yaml",
        from: "claude",
        to: "srv",
        label: "GET /__archik/yaml",
        out: { name: currentMain.name, nodes: currentMain.nodes.length, edges: currentMain.edges.length },
      })
      .step({
        id: "put-sidecar",
        from: "claude",
        to: "srv",
        label: "PUT /__archik/sidecar (proposed full doc)",
        in: { added: ["orders-db"], note: "add orders-db" },
        out: { sidecar: ".archik/main.archik.suggested.yaml", suggestion: sidecar.metadata?.suggestion },
      })
      .step({
        id: "accept",
        from: "ui",
        to: "srv",
        label: "POST /__archik/accept",
        in: { sidecar: ".archik/main.archik.suggested.yaml" },
        out: { mergedNodes: promoted.nodes.length, mergedEdges: promoted.edges.length },
      })
      .step({
        id: "accept-response",
        from: "srv",
        to: "ui",
        label: "200 OK — sidecar deleted",
        out: { ok: true },
      })
      .flush();

    await rm(cwd, { recursive: true, force: true });
  });
});
