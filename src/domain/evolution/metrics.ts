/**
 * Evolution loop — Measure stage.
 *
 * Did the system actually get better? The report compares the last
 * 7 days against the 7 days before that, so the effect of an applied
 * proposal is visible as a trend, not a feeling.
 */
import type { EvolutionEvent } from "./events.ts";

export type Window = {
  commands: number;
  errors: number;
  errorRate: number | null;
  accepts: number;
  rejects: number;
  acceptanceRate: number | null;
  validateErrors: number;
  driftErrors: number;
  proposalsApplied: number;
};

export type EvolutionReport = {
  totalEvents: number;
  window: { current: Window; previous: Window };
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function emptyWindow(): Window {
  return {
    commands: 0,
    errors: 0,
    errorRate: null,
    accepts: 0,
    rejects: 0,
    acceptanceRate: null,
    validateErrors: 0,
    driftErrors: 0,
    proposalsApplied: 0,
  };
}

function ratio(num: number, den: number): number | null {
  return den === 0 ? null : num / den;
}

function summarize(events: EvolutionEvent[]): Window {
  const w = emptyWindow();
  for (const e of events) {
    switch (e.type) {
      case "command":
        w.commands += 1;
        if (e.outcome === "error") w.errors += 1;
        break;
      case "suggest_accepted":
        w.accepts += 1;
        break;
      case "suggest_rejected":
        w.rejects += 1;
        break;
      case "validate_result":
        if (e.outcome === "error") w.validateErrors += 1;
        break;
      case "drift_result":
        if (e.outcome === "error") w.driftErrors += 1;
        break;
      case "proposal_approved":
        w.proposalsApplied += 1;
        break;
      case "proposal_rejected":
        break;
    }
  }
  w.errorRate = ratio(w.errors, w.commands);
  w.acceptanceRate = ratio(w.accepts, w.accepts + w.rejects);
  return w;
}

export function buildReport(
  events: EvolutionEvent[],
  now: Date,
): EvolutionReport {
  const nowMs = now.getTime();
  const current: EvolutionEvent[] = [];
  const previous: EvolutionEvent[] = [];
  for (const e of events) {
    const t = Date.parse(e.ts);
    if (Number.isNaN(t)) continue;
    const age = nowMs - t;
    if (age >= 0 && age < WEEK_MS) current.push(e);
    else if (age >= WEEK_MS && age < 2 * WEEK_MS) previous.push(e);
  }
  return {
    totalEvents: events.length,
    window: { current: summarize(current), previous: summarize(previous) },
  };
}
