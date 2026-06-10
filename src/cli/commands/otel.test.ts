import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { otelCommand } from "./otel.ts";

const archYaml = [
  'version: "1.0"',
  "name: Demo",
  "nodes:",
  "  - id: api",
  "    kind: external",
  "    name: API",
  "    description: x",
  "  - id: billing",
  "    kind: external",
  "    name: Billing",
  "    description: x",
  "    metadata:",
  "      otelService: billing-svc",
  "edges:",
  "  - id: api-billing",
  "    from: api",
  "    to: billing",
  "    relationship: http_call",
  "",
].join("\n");

describe("otelCommand", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-otel-"));
    await mkdir(path.join(cwd, ".archik"));
    await writeFile(path.join(cwd, ".archik/main.archik.yaml"), archYaml);
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

  it("passes when the runtime graph matches the diagram", async () => {
    await writeFile(
      path.join(cwd, "deps.json"),
      JSON.stringify([{ parent: "api", child: "billing-svc", callCount: 9 }]),
    );
    const code = await otelCommand({ _: ["check"], graph: "deps.json" });
    expect(code).toBe(0);
    const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(out).toContain("matches the diagram");
  });

  it("fails on undeclared production calls, with JSON support", async () => {
    await writeFile(
      path.join(cwd, "deps.json"),
      JSON.stringify({
        data: [{ parent: "billing-svc", child: "api", callCount: 2 }],
      }),
    );
    // billing → api IS declared (either direction). Add a third
    // service mapping to nothing… instead flip: api→billing declared,
    // so use an unknown direction pair via a new service name bound
    // by id: declare nothing between billing and a node "db".
    await writeFile(
      path.join(cwd, ".archik/main.archik.yaml"),
      archYaml.replace(
        "edges:",
        [
          "  - id: db",
          "    kind: external",
          "    name: DB",
          "    description: x",
          "edges:",
        ].join("\n"),
      ),
    );
    await writeFile(
      path.join(cwd, "deps.json"),
      JSON.stringify([{ parent: "billing-svc", child: "db", callCount: 4 }]),
    );
    const code = await otelCommand({ _: ["check"], graph: "deps.json", json: "true" });
    expect(code).toBe(1);
    const parsed = JSON.parse(logSpy.mock.calls.map((c) => c.join(" ")).join("\n"));
    expect(parsed.ok).toBe(false);
    expect(parsed.undeclared[0]).toMatchObject({ fromNode: "billing", toNode: "db" });
  });

  it("errors on a malformed graph file", async () => {
    await writeFile(path.join(cwd, "deps.json"), JSON.stringify({ nope: 1 }));
    const code = await otelCommand({ _: ["check"], graph: "deps.json" });
    expect(code).toBe(2);
  });

  it("requires the check subcommand and --graph", async () => {
    expect(await otelCommand({ _: [] })).toBe(2);
    expect(await otelCommand({ _: ["check"] })).toBe(2);
  });
});
