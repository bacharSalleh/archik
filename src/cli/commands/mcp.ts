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
import { affectedCommand } from "./affected.ts";
import { driftCommand } from "./drift.ts";
import { evolutionCommand } from "./evolution.ts";
import { patternsCommand } from "./patterns.ts";
import { qCommand } from "./q.ts";
import { schemaCommand } from "./schema.ts";
import { suggestCommand } from "./suggest.ts";
import { traceCommand } from "./trace.ts";
import { validateCommand } from "./validate.ts";
import { readLearned } from "../../io/evolution-log.ts";
import { pkgVersion } from "../paths.ts";
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
    {
      name: "archik_evolution_status",
      description:
        "The self-evolution loop's state: whether observation is on, event/proposal counts, learned-note count. The loop: observe → reflect → propose → validate → apply (human-gated) → measure.",
      inputSchema: { type: "object", properties: {} },
      run: () => capture(() => evolutionCommand(opts(["status"]))),
    },
    {
      name: "archik_evolution_reflect",
      description:
        "Run the deterministic reflection heuristics over the local event log. New insights become pending proposal files (with evidence) for the human to review.",
      inputSchema: { type: "object", properties: {} },
      run: () => capture(() => evolutionCommand(opts(["reflect"]))),
    },
    {
      name: "archik_evolution_proposals",
      description:
        "List the loop's self-improvement proposals and their statuses (pending / approved / rejected / applied).",
      inputSchema: { type: "object", properties: {} },
      run: () => capture(() => evolutionCommand(opts(["proposals"]))),
    },
    {
      name: "archik_evolution_propose",
      description:
        "File an agent-authored self-improvement proposal (deeper reflection than the built-in heuristics). YAML with kind (skill-note | update-node | add-exception), summary, payload, optional evidence. It lands as PENDING — a human approves via `archik evolution approve`.",
      inputSchema: {
        type: "object",
        properties: {
          yaml: str("the proposal draft as YAML text"),
        },
        required: ["yaml"],
      },
      run: async (args) => {
        const yaml = args["yaml"];
        if (typeof yaml !== "string" || yaml.trim() === "") {
          return { exit: 2, stdout: "", stderr: "yaml argument is required" };
        }
        const dir = await mkdtemp(path.join(tmpdir(), "archik-mcp-"));
        const draftPath = path.join(dir, "proposal.yaml");
        try {
          await writeFile(draftPath, yaml, "utf-8");
          return await capture(() =>
            evolutionCommand(opts(["propose", draftPath])),
          );
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      },
    },
    {
      name: "archik_evolution_report",
      description:
        "Measure stage: 7-day trends vs the week before (error rate, suggestion acceptance rate, validate/drift failures, proposals applied). Use to judge whether applied proposals helped.",
      inputSchema: { type: "object", properties: {} },
      run: () => capture(() => evolutionCommand(opts(["report"]))),
    },
    {
      name: "archik_patterns_list",
      description:
        "List the self-evolution pattern library (evolution-loop, sidecar-approval-gate, learned-overlay, truth-chain, feedback-pipeline) with one-line intents.",
      inputSchema: { type: "object", properties: {} },
      run: () => capture(() => patternsCommand(opts(["list"]))),
    },
    {
      name: "archik_patterns_show",
      description:
        "Read one self-evolution pattern document: intent, structure, safety rules, trade-offs, blueprint. Use when designing a self-evolving system for the user.",
      inputSchema: {
        type: "object",
        properties: { id: str("pattern id, e.g. evolution-loop") },
        required: ["id"],
      },
      run: (args) =>
        capture(() => patternsCommand(opts(["show", opt(args, "id")]))),
    },
  ];
}

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
};

/**
 * MCP resources — read-only project state an agent can pull (or a
 * client can pin into context) without a tool round-trip. Each one
 * delegates to the matching --json command, same single-implementation
 * rule as the tools.
 */
type ResourceDef = {
  uri: string;
  name: string;
  description: string;
  run: () => Promise<CapturedRun>;
};

function buildResources(): ResourceDef[] {
  return [
    {
      uri: "archik://schema",
      name: "Document schema",
      description: "Node kinds, relationships, fields, and validation rules — read before authoring.",
      run: () => capture(async () => schemaCommand(opts([]))),
    },
    {
      uri: "archik://stats",
      name: "Diagram stats",
      description: "Node + edge counts by kind and relationship across all archik files.",
      run: () => capture(() => qCommand(opts(["stats"]))),
    },
    {
      uri: "archik://trace",
      name: "Trace matrix",
      description: "Use case × slice × tests × seq realization coverage — the 'are we done?' view.",
      run: () => capture(() => traceCommand(opts([]))),
    },
    {
      uri: "archik://validate",
      name: "Validation report",
      description: "Schema + cross-file + sourcePath + governance constraint results for the project.",
      run: () => capture(() => validateCommand(opts([]))),
    },
    {
      uri: "archik://drift",
      name: "Drift report",
      description: "Diagram vs source tree: orphan nodes, unmapped code, missing slice tests.",
      run: () => capture(() => driftCommand(opts([]))),
    },
    {
      uri: "archik://evolution",
      name: "Evolution loop status",
      description:
        "Self-evolution loop state: observation on/off, event counts, pending proposals, learned notes.",
      run: () => capture(() => evolutionCommand(opts(["status"]))),
    },
    {
      uri: "archik://learned",
      name: "Learned overlay",
      description:
        "Approved lessons the system gathered from its own usage. READ AT SESSION START and treat as binding guidance — each note exists because a human approved it.",
      run: async () => {
        const learned = await readLearned(process.cwd());
        return {
          exit: 0,
          stdout:
            learned ??
            "(no learned notes yet — the overlay grows as evolution proposals are approved)",
          stderr: "",
        };
      },
    },
  ];
}

/**
 * MCP prompts — reusable workflows a client can surface as slash
 * commands. They encode the same loop the Claude Code skill teaches,
 * so non-Claude-Code agents inherit the working method, not just the
 * verbs.
 */
type PromptDef = {
  name: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
  render: (args: Record<string, string>) => string;
};

function buildPrompts(): PromptDef[] {
  return [
    {
      name: "propose-change",
      description:
        "Stage an architecture change for a feature as a reviewable suggestion sidecar (the archik DISCOVER → DESIGN loop).",
      arguments: [
        {
          name: "feature",
          description: "What you want to build or change, in one or two sentences.",
          required: true,
        },
      ],
      render: (args) =>
        [
          `You are proposing an architecture change with archik. Feature: ${args["feature"] ?? "(not specified)"}.`,
          "",
          "Follow this loop strictly:",
          "1. DISCOVER — ground in what exists. Call archik_stats, archik_list_nodes, and archik_describe on the nodes the feature plausibly touches. Never design against an imagined diagram.",
          "2. SCHEMA — call archik_schema before authoring anything.",
          "3. DESIGN — draft the FULL proposed end-state (every node and edge, not a delta). Apply the heuristics: one responsibility per node; async (publishes/subscribes) at context boundaries; externals behind ports; public traffic through a gateway/auth; respect every governance constraint in the document.",
          "4. STAGE — call archik_suggest_set with the draft YAML and a one-line note. If validation rejects it, fix the draft and re-stage; never bypass the contract by editing files directly.",
          "5. STOP — the human reviews the diff on the canvas. Do not call archik_suggest_accept unless they explicitly approve.",
        ].join("\n"),
    },
    {
      name: "review-architecture",
      description:
        "Assess the current model for gaps and smells: coverage, drift, god nodes, missing boundaries.",
      arguments: [],
      render: () =>
        [
          "Review this project's architecture model with archik tools (read-only).",
          "",
          "1. Call archik_stats, archik_trace, archik_drift, and archik_validate.",
          "2. For the 3 most-connected nodes (archik_impact / archik_dependents), judge: single responsibility? missing port/gateway? god node?",
          "3. Report findings ordered by risk, each with: the evidence (tool output), why it matters, and the smallest next action (a specific archik command or /archik:* step).",
          "4. Do NOT stage any change — this is an assessment. End with the one improvement you'd make first.",
        ].join("\n"),
    },
    {
      name: "evolution-loop",
      description:
        "Reflect on the project's usage history more deeply than the built-in heuristics, and file self-improvement proposals for human review.",
      arguments: [],
      render: () =>
        [
          "You are the reflect stage of this project's evolution loop (observe → reflect → propose → validate → apply → measure).",
          "",
          "1. OBSERVE — call archik_evolution_status. If observation is off, stop and tell the user to run `archik evolution enable`.",
          "2. REFLECT — call archik_evolution_reflect for the deterministic baseline, then read archik://learned and archik_evolution_report. Look for patterns the heuristics miss: repeated near-identical suggestions, drift clustering on one subsystem, error spikes after specific changes.",
          "3. PROPOSE — for each finding the baseline missed, call archik_evolution_propose with a YAML draft: kind (skill-note for guidance, update-node / add-exception for diagram fixes), a one-line summary, a payload, and evidence. Small, specific proposals beat big vague ones.",
          "4. STOP — proposals land as PENDING. The human reviews with `archik evolution proposals` and applies with `archik evolution approve`. Never claim a proposal was applied.",
        ].join("\n"),
    },
  ];
}

export type McpHandler = (
  message: JsonRpcMessage,
) => Promise<Record<string, unknown> | undefined>;

/**
 * Protocol core, factored out of the transport so tests can drive it
 * message-by-message. Returns the response object (to be serialised
 * onto stdout) or undefined for notifications.
 */
export function createMcpHandler(): McpHandler {
  const tools = buildTools();
  const byName = new Map(tools.map((t) => [t.name, t]));
  const resources = buildResources();
  const resourceByUri = new Map(resources.map((r) => [r.uri, r]));
  const prompts = buildPrompts();
  const promptByName = new Map(prompts.map((p) => [p.name, p]));
  // Serialise tool/resource runs — the underlying commands own
  // console + cwd.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(run: () => Promise<T>): Promise<T> => {
    const result = queue.then(run);
    queue = result.catch(() => {});
    return result;
  };

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
            capabilities: { tools: {}, resources: {}, prompts: {} },
            serverInfo: { name: "archik", version: pkgVersion() },
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
      case "resources/list":
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {
            resources: resources.map(({ uri, name, description }) => ({
              uri,
              name,
              description,
              mimeType: "application/json",
            })),
          },
        };
      case "resources/read": {
        const uri = params?.["uri"];
        const resource =
          typeof uri === "string" ? resourceByUri.get(uri) : undefined;
        if (resource === undefined) {
          return error(id, -32602, `unknown resource: ${String(uri)}`);
        }
        const { stdout, stderr } = await enqueue(() => resource.run());
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {
            contents: [
              {
                uri: resource.uri,
                mimeType: "application/json",
                text: stdout || stderr || "{}",
              },
            ],
          },
        };
      }
      case "prompts/list":
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {
            prompts: prompts.map(({ name, description, arguments: args }) => ({
              name,
              description,
              arguments: args,
            })),
          },
        };
      case "prompts/get": {
        const name = params?.["name"];
        const prompt =
          typeof name === "string" ? promptByName.get(name) : undefined;
        if (prompt === undefined) {
          return error(id, -32602, `unknown prompt: ${String(name)}`);
        }
        const args = (params?.["arguments"] ?? {}) as Record<string, string>;
        const missing = prompt.arguments.filter(
          (a) => a.required && (args[a.name] === undefined || args[a.name] === ""),
        );
        if (missing.length > 0) {
          return error(
            id,
            -32602,
            `missing required argument(s): ${missing.map((a) => a.name).join(", ")}`,
          );
        }
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {
            description: prompt.description,
            messages: [
              {
                role: "user",
                content: { type: "text", text: prompt.render(args) },
              },
            ],
          },
        };
      }
      case "tools/call": {
        const name = params?.["name"];
        const tool = typeof name === "string" ? byName.get(name) : undefined;
        if (tool === undefined) {
          return error(id, -32602, `unknown tool: ${String(name)}`);
        }
        const args = (params?.["arguments"] ?? {}) as Record<string, unknown>;
        const { exit, stdout, stderr } = await enqueue(() => tool.run(args));
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
