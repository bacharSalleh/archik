import { describe, expect, it } from "vitest";
import type { EvolutionEvent, EvolutionEventType } from "./events.ts";
import { reflect } from "./reflect.ts";

let tick = 0;
function ev(
  type: EvolutionEventType,
  extra: Partial<EvolutionEvent> = {},
): EvolutionEvent {
  tick += 1;
  return {
    v: 1,
    ts: `2026-06-10T12:00:${String(tick % 60).padStart(2, "0")}.000Z`,
    type,
    ...extra,
  };
}

const reject = () => ev("suggest_rejected", { outcome: "ok" });
const accept = () => ev("suggest_accepted", { outcome: "ok" });
const validateError = () =>
  ev("validate_result", { outcome: "error", exitCode: 1 });
const driftError = () => ev("drift_result", { outcome: "error", exitCode: 1 });
const commandError = (command: string) =>
  ev("command", { command, outcome: "error", exitCode: 1 });
const commandOk = (command: string) =>
  ev("command", { command, outcome: "ok", exitCode: 0 });

describe("reflect", () => {
  it("returns no insights for an empty log", () => {
    expect(reflect([])).toEqual([]);
  });

  it("fires rejection-streak at the threshold", () => {
    const insights = reflect([reject(), reject(), reject()]);
    expect(insights.map((i) => i.heuristic)).toContain("rejection-streak");
  });

  it("stays silent below the threshold", () => {
    expect(reflect([reject(), reject()])).toEqual([]);
  });

  it("stays silent when accepts keep pace with rejects", () => {
    const events = [reject(), reject(), reject(), accept(), accept(), accept()];
    expect(reflect(events)).toEqual([]);
  });

  it("fires recurring-validation-errors at the threshold", () => {
    const insights = reflect([
      validateError(),
      validateError(),
      validateError(),
    ]);
    expect(insights.map((i) => i.heuristic)).toContain(
      "recurring-validation-errors",
    );
  });

  it("ignores successful validate runs", () => {
    const ok = ev("validate_result", { outcome: "ok", exitCode: 0 });
    expect(reflect([ok, ok, ok])).toEqual([]);
  });

  it("fires recurring-drift at the threshold", () => {
    const insights = reflect([driftError(), driftError(), driftError()]);
    expect(insights.map((i) => i.heuristic)).toContain("recurring-drift");
  });

  it("fires failing-command per command, excluding validate/drift", () => {
    const events = [
      commandError("render"),
      commandError("render"),
      commandError("render"),
      commandError("validate"),
      commandError("validate"),
      commandError("validate"),
      commandError("q"),
    ];
    const insights = reflect(events);
    const failing = insights.filter((i) => i.heuristic === "failing-command");
    expect(failing).toHaveLength(1);
    expect(failing[0]!.summary).toContain("render");
  });

  it("counts evidence and includes samples", () => {
    const insights = reflect([reject(), reject(), reject(), reject()]);
    const streak = insights.find((i) => i.heuristic === "rejection-streak")!;
    expect(streak.evidence.events).toBe(4);
    expect(streak.evidence.samples.length).toBeGreaterThan(0);
    expect(streak.evidence.samples.length).toBeLessThanOrEqual(3);
  });

  it("respects a custom threshold", () => {
    expect(reflect([reject()], { threshold: 1 })).not.toEqual([]);
  });

  it("successful commands never trigger failing-command", () => {
    const events = [commandOk("render"), commandOk("render"), commandOk("render")];
    expect(reflect(events)).toEqual([]);
  });
});
