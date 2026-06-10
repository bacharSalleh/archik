/**
 * `archik mcp` — a Model Context Protocol server over stdio, so ANY
 * MCP-capable agent (Cursor, Windsurf, Copilot agent mode, Claude
 * Desktop, Zed, …) gets the same contract the Claude Code skill
 * enforces: archik files are read and written through the tool
 * surface, never by hand.
 *
 * Implementation notes:
 *   - Transport is the MCP stdio framing: one JSON-RPC 2.0 message
 *     per line on stdin/stdout. No SDK dependency — the published
 *     package ships zero runtime deps and the protocol subset we
 *     need (initialize / tools/list / tools/call / ping) is small.
 *   - Every tool delegates to the existing CLI command function
 *     in-process with `--json` set, capturing console output. One
 *     contract, one implementation — the MCP surface can't drift
 *     from the CLI surface.
 *   - Tool calls are serialised through a queue: the command
 *     functions assume they own the process (cwd, console), so two
 *     concurrent calls must not interleave.
 *
 * Register in an MCP client as:  command: "npx", args: ["archik", "mcp"]
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { affectedCommand } from "./affected.ts";
import { driftCommand } from "./drift.ts";
import { qCommand } from "./q.ts";
import { schemaCommand } from "./schema.ts";
import { suggestCommand } from "./suggest.ts";
import { traceCommand } from "./trace.ts";
import { validateCommand } from "./validate.ts";
import { pkgRoot } from "../paths.ts";
import type { ParsedOptions } from "../options.ts";

const PROTOCOL_VERSION = "2024-11-05";

type JsonSchema = Record<string, unknown>;

type ToolDef = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  run: (args: Record<string, unknown>) => Promise<CapturedRun>;
};

type CapturedRun = { exit: number; stdout: string; stderr: string };

/** Run a CLI command function with console hijacked. The commands
 *  write structured JSON to console.log when --json is set; that
 *  text becomes the tool result. */
async function capture(fn: () => Promise<number>): Promise<CapturedRun> {
  const out: string[] = [];
  const err: string[] = [];
  /* eslint-disable no-console */
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => {
    out.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    err.push(args.map(String).join(" "));
  };
  try {
    const exit = await fn();
    return { exit, stdout: out.join("\n"), stderr: err.join("\n") };
  } catch (e) {
    return {
      exit: 1,
      stdout: out.join("\n"),
      stderr: [...err, e instanceof Error ? e.message : String(e)].join("\n"),
    };
  } finally {
    console.log = origLog;
    console.error = origErr;
    /* eslint-enable no-console */
  }
}

const str = (description: string): JsonSchema => ({ type: "string", description });

function opt(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Build ParsedOptions from positionals + named flags, dropping
 *  undefined values, always in --json mode. */
function opts(
  positionals: Array<string | undefined>,
  flags: Record<string, string | undefined> = {},
): ParsedOptions {
  const o: ParsedOptions = { _: positionals.filter((p): p is string => p !== undefined), json: "true" };
  for (const [k, v] of Object.entries(flags)) {
    if (v !== undefined) o[k] = v;
  }
  return o;
}

function qTool(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  build: (args: Record<string, unknown>) => ParsedOptions,
): ToolDef {
  return {
    name,
    description,
    inputSchema,
    run: (args) => capture(() => qCommand(build(args))),
  };
}

function buildTools(): ToolDef[] {
  const idSchema: JsonSchema = {
    type: "object",
    properties: { id: str("node id") },
    required: ["id"],
  };

  return [
    {
      name: "archik_schema",
      description:
        "Get the archik document schema (node kinds, relationships, fields, validation rules). ALWAYS read this before authoring a draft. Variants: arch (default), seq, uc, actors.",
      inputSchema: {
        type: "object",
        properties: {
          variant: {
            type: "string",
            enum: ["arch", "seq", "uc", "actors"],
            description: "which schema to print (default arch)",
          },
        },
      },
      run: (args) => {
        const variant = opt(args, "variant");
        return capture(async () =>
          schemaCommand(opts([variant === "arch" ? undefined : variant])),
        );
      },
    },
    qTool(
      "archik_describe",
      "Describe one architecture node: every field plus its incoming and outgoing edges.",
      idSchema,
      (a) => opts(["describe", opt(a, "id")]),
    ),
    qTool(
      "archik_deps",
      "Outgoing edges of a node — what does this node depend on?",
      idSchema,
      (a) => opts(["deps", opt(a, "id")]),
    ),
    qTool(
      "archik_dependents",
      "Incoming edges of a node — what depends on this node?",
      idSchema,
      (a) => opts(["dependents", opt(a, "id")]),
    ),
    qTool(
      "archik_impact",
      "Impact analysis: what breaks (directly and transitively) if this node is removed?",
      idSchema,
      (a) => opts(["impact", opt(a, "id")]),
    ),
    qTool(
      "archik_list_nodes",
      "List architecture nodes with optional filters (all filters combine).",
      {
        type: "object",
        properties: {
          kind: str("filter by node kind (service, database, queue, …)"),
          parent: str("filter by direct parentId"),
          file: str("substring match on the defining file path"),
          status: str("lifecycle filter: active | proposed | deprecated"),
          search: str("case-insensitive substring on name/description"),
          owner: str("exact match on the owning team"),
        },
      },
      (a) =>
        opts(["list"], {
          kind: opt(a, "kind"),
          parent: opt(a, "parent"),
          file: opt(a, "file"),
          status: opt(a, "status"),
          search: opt(a, "search"),
          owner: opt(a, "owner"),
        }),
    ),
    qTool(
      "archik_list_edges",
      "List edges with optional filters (from / to / relationship / status).",
      {
        type: "object",
        properties: {
          from: str("filter by source node id"),
          to: str("filter by target node id"),
          rel: str("filter by relationship (http_call, writes, publishes, …)"),
          status: str("lifecycle filter: active | proposed | deprecated"),
        },
      },
      (a) =>
        opts(["edges"], {
          from: opt(a, "from"),
          to: opt(a, "to"),
          rel: opt(a, "rel"),
          status: opt(a, "status"),
        }),
    ),
    qTool(
      "archik_stats",
      "Node + edge counts by kind and relationship across all archik files.",
      { type: "object", properties: {} },
      () => opts(["stats"]),
    ),
    qTool(
      "archik_usecases",
      "List use cases, optionally filtered to those involving an actor.",
      {
        type: "object",
        properties: { actor: str("actor id (primary or secondary)") },
      },
      (a) => opts(["usecases"], { actor: opt(a, "actor") }),
    ),
    qTool(
      "archik_describe_usecase",
      "One use case in detail: actors, flows, slices, tests, realizations.",
      {
        type: "object",
        properties: { id: str("use case id") },
        required: ["id"],
      },
      (a) => opts(["describe-usecase", opt(a, "id")]),
    ),
    qTool(
      "archik_actors",
      "List every actor in the actor index.",
      { type: "object", properties: {} },
      () => opts(["actors"]),
    ),
    qTool(
      "archik_sequences",
      "List sequence diagram files, optionally filtered to flows involving a node.",
      {
        type: "object",
        properties: { node: str("architecture node id") },
      },
      (a) => opts(["sequences"], { node: opt(a, "node") }),
    ),
    {
      name: "archik_trace",
      description:
        "The coverage matrix: use case × slice × tests × seq realization × ECB stereotypes. Answers 'are we done?' with evidence.",
      inputSchema: {
        type: "object",
        properties: {
          useCase: str("filter to one use case id"),
          actor: str("filter to use cases involving this actor"),
          status: str("slice status filter: active | proposed | deprecated"),
          coverage: str("coverage filter: full | partial | none"),
        },
      },
      run: (args) =>
        capture(() =>
          traceCommand(
            opts([], {
              "use-case": opt(args, "useCase"),
              actor: opt(args, "actor"),
              status: opt(args, "status"),
              coverage: opt(args, "coverage"),
            }),
          ),
        ),
    },
    {
      name: "archik_validate",
      description:
        "Validate the project's archik documents: schema, cross-file references, sourcePath existence, use case/actor/seq integrity, ECB rules, governance constraints. Run after EVERY change.",
      inputSchema: {
        type: "object",
        properties: { path: str("explicit document path (default: auto-resolve)") },
      },
      run: (args) => capture(() => validateCommand(opts([opt(args, "path")]))),
    },
    {
      name: "archik_drift",
      description:
        "Detect drift between the diagram and the source tree: orphan nodes (sourcePath gone), unmapped code, missing slice test files.",
      inputSchema: { type: "object", properties: {} },
      run: () => capture(() => driftCommand(opts([]))),
    },
    {
      name: "archik_affected",
      description:
        "Map changed files back onto the model: affected nodes, use case slices, tests to run, seq diagrams to re-check, unmapped files. Defaults to the git working tree vs HEAD.",
      inputSchema: {
        type: "object",
        properties: {
          since: str("git ref to diff against (default HEAD; e.g. origin/main)"),
          files: str("comma-separated explicit file list (skips git)"),
        },
      },
      run: (args) =>
        capture(() =>
          affectedCommand(
            opts([], { since: opt(args, "since"), files: opt(args, "files") }),
          ),
        ),
    },
    {
      name: "archik_suggest_show",
      description: "Summarise the pending architecture suggestion sidecar, if any.",
      inputSchema: { type: "object", properties: {} },
      run: () => capture(() => suggestCommand(opts(["show"]))),
    },
    {
      name: "archik_suggest_set",
      description:
        "Validate a draft architecture YAML (the FULL proposed end-state — every node and edge, not a delta) and stage it as the suggestion sidecar for human review. Read archik_schema first.",
      inputSchema: {
        type: "object",
        properties: {
          yaml: str("the complete draft document as YAML text"),
          note: str("one-line summary of what the suggestion changes"),
          main: str("override main file detection (path)"),
          allowOrphan: {
            type: "boolean",
            description: "permit a sidecar whose main file doesn't exist yet",
          },
        },
        required: ["yaml"],
      },
      run: async (args) => {
        const yaml = args["yaml"];
        if (typeof yaml !== "string" || yaml.trim() === "") {
          return { exit: 2, stdout: "", stderr: "yaml argument is required" };
        }
        // The CLI reads drafts from a file or stdin; stdin isn't ours
        // to replay in-process, so stage through a temp file.
        const dir = await mkdtemp(path.join(tmpdir(), "archik-mcp-"));
        const draftPath = path.join(dir, "draft.yaml");
        try {
          await writeFile(draftPath, yaml, "utf-8");
          return await capture(() =>
            suggestCommand(
              opts(["set", draftPath], {
                note: opt(args, "note"),
                main: opt(args, "main"),
                "allow-orphan": args["allowOrphan"] === true ? "true" : undefined,
              }),
            ),
          );
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      },
    },
    {
      name: "archik_suggest_accept",
      description:
        "Apply the pending suggestion sidecar over the main file. Only call when the user has explicitly approved the suggestion.",
      inputSchema: { type: "object", properties: {} },
      run: () => capture(() => suggestCommand(opts(["accept"]))),
    },
    {
      name: "archik_suggest_reject",
      description: "Discard the pending suggestion sidecar.",
      inputSchema: { type: "object", properties: {} },
      run: () => capture(() => suggestCommand(opts(["reject"]))),
    },
  ];
}

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
};

export type McpHandler = (
  message: JsonRpcMessage,
) => Promise<Record<string, unknown> | undefined>;

function readVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(pkgRoot(), "package.json"), "utf-8"),
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Protocol core, factored out of the transport so tests can drive it
 * message-by-message. Returns the response object (to be serialised
 * onto stdout) or undefined for notifications.
 */
export function createMcpHandler(): McpHandler {
  const tools = buildTools();
  const byName = new Map(tools.map((t) => [t.name, t]));
  // Serialise tool runs — the underlying commands own console + cwd.
  let queue: Promise<unknown> = Promise.resolve();

  const error = (
    id: JsonRpcMessage["id"],
    code: number,
    message: string,
  ): Record<string, unknown> => ({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  });

  return async (message) => {
    const { id, method, params } = message;
    const isNotification = id === undefined;

    if (method === undefined) {
      return isNotification ? undefined : error(id, -32600, "missing method");
    }
    if (method.startsWith("notifications/")) return undefined;

    switch (method) {
      case "initialize": {
        const requested = params?.["protocolVersion"];
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {
            protocolVersion:
              typeof requested === "string" ? requested : PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: "archik", version: readVersion() },
          },
        };
      }
      case "ping":
        return { jsonrpc: "2.0", id: id ?? null, result: {} };
      case "tools/list":
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {
            tools: tools.map(({ name, description, inputSchema }) => ({
              name,
              description,
              inputSchema,
            })),
          },
        };
      case "tools/call": {
        const name = params?.["name"];
        const tool = typeof name === "string" ? byName.get(name) : undefined;
        if (tool === undefined) {
          return error(id, -32602, `unknown tool: ${String(name)}`);
        }
        const args = (params?.["arguments"] ?? {}) as Record<string, unknown>;
        const run = queue.then(() => tool.run(args));
        queue = run.catch(() => {});
        const { exit, stdout, stderr } = await run;
        const text =
          [stdout, stderr].filter((s) => s.length > 0).join("\n") ||
          `(exit ${exit}, no output)`;
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {
            content: [{ type: "text", text }],
            isError: exit !== 0,
          },
        };
      }
      default:
        return isNotification
          ? undefined
          : error(id, -32601, `method not found: ${method}`);
    }
  };
}

export async function mcpCommand(): Promise<number> {
  const handle = createMcpHandler();
  const rl = createInterface({ input: process.stdin, terminal: false });

  // The transport owns stdout; responses are written directly so the
  // captured console of tool runs can't interleave with framing.
  const write = (obj: Record<string, unknown>): void => {
    process.stdout.write(JSON.stringify(obj) + "\n");
  };

  let chain: Promise<void> = Promise.resolve();
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (trimmed === "") return;
    chain = chain.then(async () => {
      let message: JsonRpcMessage;
      try {
        message = JSON.parse(trimmed) as JsonRpcMessage;
      } catch {
        write({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "parse error" },
        });
        return;
      }
      const response = await handle(message);
      if (response !== undefined) write(response);
    });
  });

  await new Promise<void>((resolve) => rl.on("close", resolve));
  await chain;
  return 0;
}
