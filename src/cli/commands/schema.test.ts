import { describe, expect, it, vi } from "vitest";
import { NODE_KINDS } from "../../domain/taxonomy.ts";
import { RELATIONSHIPS } from "../../domain/relationships.ts";
import { schemaCommand } from "./schema.ts";

/**
 * `archik schema` is the one-shot reference an agent reads BEFORE
 * authoring a YAML draft. Its job: stop "I'll guess" mistakes
 * (`notes: "string"` instead of array, missing edge `id`).
 *
 * The contract these tests pin is loose by design — the prose can
 * evolve, the structured shape can grow new fields. What we lock:
 *   - exit 0 on either mode;
 *   - JSON output parses and includes all kinds, all relationships,
 *     and the canonical "is this an array?" hint on the
 *     `notes`/`responsibilities` entries (the most common Claude
 *     mistake);
 *   - text output mentions the same shape so an agent reading
 *     stdout doesn't miss it.
 */
describe("schemaCommand", () => {
  it("text mode: exits 0 and lists every kind + relationship", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = schemaCommand({ _: [] });
      expect(code).toBe(0);
      const out = log.mock.calls.map((c) => c[0]).join("\n");
      for (const k of NODE_KINDS) expect(out).toContain(k);
      for (const r of RELATIONSHIPS) expect(out).toContain(r);
      expect(out).toContain("DOCUMENT");
      expect(out).toContain("NODE");
      expect(out).toContain("EDGE");
      expect(out).toContain("CONSTRAINTS");
    } finally {
      log.mockRestore();
    }
  });

  it("text mode: surfaces the array-vs-string hint on `notes`", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      schemaCommand({ _: [] });
      const out = log.mock.calls.map((c) => c[0]).join("\n");
      // The "ARRAY, never a single string" note is the antidote to
      // the most common authoring mistake; failing this test means
      // the hint would be silently dropped from the agent-facing
      // output.
      expect(out).toMatch(/notes\s+optional\s+array of string/);
      expect(out).toContain("ARRAY, never a single string");
    } finally {
      log.mockRestore();
    }
  });

  it("text mode: marks edge.id as REQUIRED", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      schemaCommand({ _: [] });
      const out = log.mock.calls.map((c) => c[0]).join("\n");
      // Confirm the edge.id surface is described as required, since
      // missing edge.id is the second canonical mistake.
      expect(out).toMatch(/EDGE[\s\S]*id\s+required/);
    } finally {
      log.mockRestore();
    }
  });

  it("schema seq prints seq schema in human format", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => output.push(args.join(" ")));
    const exit = schemaCommand({ _: ["seq"] });
    expect(exit).toBe(0);
    const joined = output.join("\n");
    expect(joined).toContain("SEQ DOCUMENT");
    expect(joined).toContain("participants");
    expect(joined).toContain("steps");
    expect(joined).toContain("ARROW TYPES");
    expect(joined).toContain("sync");
    expect(joined).toContain("GROUP KINDS");
    expect(joined).toContain("alt");
  });

  it("schema seq --json returns structured seq schema", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => output.push(args.join(" ")));
    schemaCommand({ _: ["seq"], json: "true" });
    const parsed = JSON.parse(output[0]!);
    expect(parsed.seqDocument).toBeDefined();
    expect(parsed.arrowTypes).toContain("sync");
    expect(parsed.groupKinds).toContain("alt");
  });

  it("schema uc prints use case schema in human format", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => output.push(args.join(" ")));
    const exit = schemaCommand({ _: ["uc"] });
    expect(exit).toBe(0);
    const joined = output.join("\n");
    expect(joined).toContain("USE CASE DOCUMENT");
    expect(joined).toContain("primaryActor");
    expect(joined).toContain("flows");
    expect(joined).toContain("SLICE");
    expect(joined).toContain("REALIZATION");
  });

  it("schema usecase (alias) returns same schema", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => output.push(args.join(" ")));
    schemaCommand({ _: ["usecase"], json: "true" });
    const parsed = JSON.parse(output[0]!);
    expect(parsed.useCaseDocument).toBeDefined();
    expect(parsed.slice).toBeDefined();
  });

  it("schema actors prints actor schema in human format", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => output.push(args.join(" ")));
    const exit = schemaCommand({ _: ["actors"] });
    expect(exit).toBe(0);
    const joined = output.join("\n");
    expect(joined).toContain("ACTOR DOCUMENT");
    expect(joined).toContain("ACTOR KINDS");
    expect(joined).toContain("human");
    expect(joined).toContain("external-system");
  });

  it("schema actors --json returns structured actor schema", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => output.push(args.join(" ")));
    schemaCommand({ _: ["actors"], json: "true" });
    const parsed = JSON.parse(output[0]!);
    expect(parsed.actor).toBeDefined();
    expect(parsed.actorKinds).toContain("human");
    expect(parsed.actorKinds).toContain("external-system");
  });

  it("node schema includes the optional stereotype field", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => output.push(args.join(" ")));
    schemaCommand({ _: [], json: "true" });
    const parsed = JSON.parse(output[0]!);
    const stereotypeField = parsed.node.find(
      (f: { name: string }) => f.name === "stereotype",
    );
    expect(stereotypeField).toBeDefined();
    expect(stereotypeField.required).toBe(false);
    expect(stereotypeField.type).toBe("enum");
    expect(stereotypeField.notes).toMatch(/boundary \| control \| entity/);
  });

  it("schema seq output includes the optional realizes binding", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => output.push(args.join(" ")));
    schemaCommand({ _: ["seq"], json: "true" });
    const parsed = JSON.parse(output[0]!);
    const realizesField = parsed.seqDocument.find(
      (f: { name: string }) => f.name === "realizes",
    );
    expect(realizesField).toBeDefined();
    expect(realizesField.required).toBe(false);
  });

  it("json mode: emits a parseable object on stdout", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = schemaCommand({ _: [], json: "true" });
      expect(code).toBe(0);
      expect(log).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(log.mock.calls[0]![0] as string) as {
        kinds: string[];
        relationships: string[];
        node: Array<{ name: string; required: boolean; type: string }>;
        edge: Array<{ name: string; required: boolean }>;
      };
      expect(parsed.kinds).toEqual([...NODE_KINDS]);
      expect(parsed.relationships).toEqual([...RELATIONSHIPS]);
      expect(parsed.node.find((f) => f.name === "id")?.required).toBe(true);
      expect(parsed.node.find((f) => f.name === "notes")?.type).toBe(
        "array of string",
      );
      expect(parsed.edge.find((f) => f.name === "id")?.required).toBe(true);
    } finally {
      log.mockRestore();
    }
  });
});
