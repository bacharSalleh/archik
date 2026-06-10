import { describe, expect, it } from "vitest";
import {
  EvolutionEventSchema,
  deriveEvents,
  parseEventLine,
  type EvolutionEvent,
} from "./events.ts";

const base = { v: 1, ts: "2026-06-10T12:00:00.000Z" } as const;

describe("EvolutionEventSchema", () => {
  it("accepts a command event", () => {
    const e = {
      ...base,
      type: "command",
      command: "validate",
      outcome: "error",
      exitCode: 1,
      durationMs: 12,
      flags: ["json"],
    };
    expect(EvolutionEventSchema.safeParse(e).success).toBe(true);
  });

  it("rejects an unknown event type", () => {
    expect(
      EvolutionEventSchema.safeParse({ ...base, type: "nope" }).success,
    ).toBe(false);
  });

  it("rejects a missing version", () => {
    expect(
      EvolutionEventSchema.safeParse({ ts: base.ts, type: "command" }).success,
    ).toBe(false);
  });
});

describe("deriveEvents", () => {
  const run = (
    command: string,
    sub: string | undefined,
    exitCode: number,
  ): EvolutionEvent[] =>
    deriveEvents({
      command,
      sub,
      flags: ["json"],
      exitCode,
      durationMs: 5,
      ts: base.ts,
    });

  it("always emits a command event first", () => {
    const evs = run("q", "list", 0);
    expect(evs[0]).toMatchObject({
      type: "command",
      command: "q",
      sub: "list",
      outcome: "ok",
      exitCode: 0,
    });
  });

  it("marks non-zero exits as errors", () => {
    expect(run("q", "list", 2)[0]).toMatchObject({ outcome: "error" });
  });

  it("derives suggest_accepted from `suggest accept` exit 0", () => {
    expect(run("suggest", "accept", 0).map((e) => e.type)).toContain(
      "suggest_accepted",
    );
  });

  it("derives suggest_rejected from `suggest reject` exit 0", () => {
    expect(run("suggest", "reject", 0).map((e) => e.type)).toContain(
      "suggest_rejected",
    );
  });

  it("derives validate_result error from `validate` exit 1", () => {
    const evs = run("validate", undefined, 1);
    expect(evs.find((e) => e.type === "validate_result")).toMatchObject({
      outcome: "error",
    });
  });

  it("derives validate_result ok from `validate` exit 0", () => {
    const evs = run("validate", undefined, 0);
    expect(evs.find((e) => e.type === "validate_result")).toMatchObject({
      outcome: "ok",
    });
  });

  it("derives drift_result from `drift`", () => {
    expect(run("drift", undefined, 1).map((e) => e.type)).toContain(
      "drift_result",
    );
  });

  it("does not derive extra events when `suggest accept` fails", () => {
    expect(run("suggest", "accept", 1).map((e) => e.type)).toEqual([
      "command",
    ]);
  });

  it("does not derive validate_result on usage errors (exit 2)", () => {
    expect(run("validate", undefined, 2).map((e) => e.type)).toEqual([
      "command",
    ]);
  });

  it("every derived event passes the schema", () => {
    for (const e of run("suggest", "accept", 0)) {
      expect(EvolutionEventSchema.safeParse(e).success).toBe(true);
    }
  });
});

describe("parseEventLine", () => {
  it("round-trips a valid event", () => {
    const e: EvolutionEvent = {
      ...base,
      type: "command",
      command: "validate",
      outcome: "ok",
      exitCode: 0,
      durationMs: 3,
      flags: [],
    };
    expect(parseEventLine(JSON.stringify(e))).toEqual(e);
  });

  it("returns null on corrupt JSON", () => {
    expect(parseEventLine("{oops")).toBeNull();
  });

  it("returns null on schema-invalid JSON", () => {
    expect(parseEventLine(JSON.stringify({ bad: true }))).toBeNull();
  });

  it("returns null on empty line", () => {
    expect(parseEventLine("")).toBeNull();
  });
});
