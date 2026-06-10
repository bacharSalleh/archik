import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMcpHandler } from "./mcp.ts";

/**
 * Drives the protocol core message-by-message (the stdio transport is
 * a thin readline loop on top). Tool behaviour itself is covered by
 * each command's own test file — here we pin the JSON-RPC envelope,
 * the tool registry, and that calls really hit the underlying
 * commands against a real project on disk.
 */
const archYaml = [
  'version: "1.0"',
  "name: Demo",
  "nodes:",
  "  - id: api",
  "    kind: external",
  "    name: API",
  "    description: test fixture",
  "    owner: team-core",
  "edges: []",
  "",
].join("\n");

describe("createMcpHandler", () => {
  let cwd: string;
  let originalCwd: string;
  let handle: ReturnType<typeof createMcpHandler>;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "archik-mcp-"));
    await mkdir(path.join(cwd, ".archik"));
    await writeFile(path.join(cwd, ".archik/main.archik.yaml"), archYaml);
    originalCwd = process.cwd();
    process.chdir(cwd);
    handle = createMcpHandler();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(cwd, { recursive: true, force: true });
  });

  it("answers initialize with serverInfo and tool capability", async () => {
    const res = (await handle({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26" },
    })) as { result: { protocolVersion: string; serverInfo: { name: string } } };
    expect(res.result.protocolVersion).toBe("2025-03-26");
    expect(res.result.serverInfo.name).toBe("archik");
  });

  it("stays silent on notifications", async () => {
    const res = await handle({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(res).toBeUndefined();
  });

  it("lists the tool registry with input schemas", async () => {
    const res = (await handle({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    })) as { result: { tools: Array<{ name: string; inputSchema: unknown }> } };
    const names = res.result.tools.map((t) => t.name);
    expect(names).toContain("archik_validate");
    expect(names).toContain("archik_describe");
    expect(names).toContain("archik_suggest_set");
    expect(names).toContain("archik_affected");
    for (const t of res.result.tools) expect(t.inputSchema).toBeDefined();
  });

  it("runs archik_validate against the project and returns JSON text", async () => {
    const res = (await handle({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "archik_validate", arguments: {} },
    })) as {
      result: { isError: boolean; content: Array<{ type: string; text: string }> };
    };
    expect(res.result.isError).toBe(false);
    const parsed = JSON.parse(res.result.content[0]!.text);
    expect(parsed.ok).toBe(true);
    expect(parsed.nodes).toBe(1);
  });

  it("runs archik_describe and surfaces the owner field", async () => {
    const res = (await handle({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "archik_describe", arguments: { id: "api" } },
    })) as { result: { isError: boolean; content: Array<{ text: string }> } };
    expect(res.result.isError).toBe(false);
    const parsed = JSON.parse(res.result.content[0]!.text);
    expect(parsed.node.owner).toBe("team-core");
  });

  it("flags isError when the underlying command fails", async () => {
    const res = (await handle({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "archik_describe", arguments: { id: "nope" } },
    })) as { result: { isError: boolean } };
    expect(res.result.isError).toBe(true);
  });

  it("stages a sidecar via archik_suggest_set", async () => {
    const draft = [
      'version: "1.0"',
      "name: Demo",
      "nodes:",
      "  - id: api",
      "    kind: external",
      "    name: API",
      "    description: test fixture",
      "    owner: team-core",
      "  - id: db",
      "    kind: database",
      "    name: DB",
      "    description: test fixture",
      "edges: []",
      "",
    ].join("\n");
    const res = (await handle({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "archik_suggest_set",
        arguments: { yaml: draft, note: "add db" },
      },
    })) as { result: { isError: boolean; content: Array<{ text: string }> } };
    expect(res.result.isError).toBe(false);
    expect(
      existsSync(path.join(cwd, ".archik/main.archik.suggested.yaml")),
    ).toBe(true);
  });

  it("errors on unknown tools and unknown methods", async () => {
    const unknownTool = (await handle({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "archik_nope", arguments: {} },
    })) as { error: { code: number } };
    expect(unknownTool.error.code).toBe(-32602);

    const unknownMethod = (await handle({
      jsonrpc: "2.0",
      id: 8,
      method: "resources/list",
    })) as { error: { code: number } };
    expect(unknownMethod.error.code).toBe(-32601);
  });

  it("answers ping", async () => {
    const res = (await handle({ jsonrpc: "2.0", id: 9, method: "ping" })) as {
      result: Record<string, unknown>;
    };
    expect(res.result).toEqual({});
  });
});
