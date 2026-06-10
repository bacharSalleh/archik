import { describe, expect, it } from "vitest";
import type { EvolutionEvent, EvolutionEventType } from "./events.ts";
import { buildReport } from "./metrics.ts";

const NOW = new Date("2026-06-10T12:00:00.000Z");

function ev(
  type: EvolutionEventType,
  daysAgo: number,
  extra: Partial<EvolutionEvent> = {},
): EvolutionEvent {
  const ts = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return { v: 1, ts: ts.toISOString(), type, ...extra };
}

describe("buildReport", () => {
  it("reports zeros and null rates on an empty log", () => {
    const r = buildReport([], NOW);
    expect(r.totalEvents).toBe(0);
    expect(r.window.current.commands).toBe(0);
    expect(r.window.current.errorRate).toBeNull();
    expect(r.window.current.acceptanceRate).toBeNull();
  });

  it("splits events into current and previous 7-day windows", () => {
    const events = [
      ev("command", 1, { command: "q", outcome: "ok", exitCode: 0 }),
      ev("command", 10, { command: "q", outcome: "error", exitCode: 1 }),
      ev("command", 20, { command: "q", outcome: "ok", exitCode: 0 }), // outside both
    ];
    const r = buildReport(events, NOW);
    expect(r.totalEvents).toBe(3);
    expect(r.window.current.commands).toBe(1);
    expect(r.window.previous.commands).toBe(1);
    expect(r.window.previous.errors).toBe(1);
  });

  it("computes error and acceptance rates", () => {
    const events = [
      ev("command", 1, { command: "q", outcome: "ok", exitCode: 0 }),
      ev("command", 2, { command: "q", outcome: "error", exitCode: 1 }),
      ev("suggest_accepted", 1),
      ev("suggest_accepted", 2),
      ev("suggest_rejected", 3),
    ];
    const r = buildReport(events, NOW);
    expect(r.window.current.errorRate).toBeCloseTo(0.5);
    expect(r.window.current.accepts).toBe(2);
    expect(r.window.current.rejects).toBe(1);
    expect(r.window.current.acceptanceRate).toBeCloseTo(2 / 3);
  });

  it("counts validate/drift errors and applied proposals", () => {
    const events = [
      ev("validate_result", 1, { outcome: "error", exitCode: 1 }),
      ev("validate_result", 2, { outcome: "ok", exitCode: 0 }),
      ev("drift_result", 3, { outcome: "error", exitCode: 1 }),
      ev("proposal_approved", 4),
    ];
    const r = buildReport(events, NOW);
    expect(r.window.current.validateErrors).toBe(1);
    expect(r.window.current.driftErrors).toBe(1);
    expect(r.window.current.proposalsApplied).toBe(1);
  });

  it("ignores events with unparseable timestamps", () => {
    const bad: EvolutionEvent = { v: 1, ts: "not-a-date", type: "command" };
    const r = buildReport([bad], NOW);
    expect(r.window.current.commands).toBe(0);
    expect(r.totalEvents).toBe(1);
  });
});
