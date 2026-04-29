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
