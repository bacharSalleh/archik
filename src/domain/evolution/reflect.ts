/**
 * Evolution loop — Reflect stage.
 *
 * Pure heuristics that turn the event log into *insights*: patterns
 * worth proposing an upgrade for. Deterministic and testable on
 * purpose — an LLM can reflect more deeply on the same events via
 * the MCP `evolution-loop` prompt, but the core loop never needs one.
 */
import type { EvolutionEvent } from "./events.ts";

export type Heuristic =
  | "rejection-streak"
  | "recurring-validation-errors"
  | "recurring-drift"
  | "failing-command";

export type Insight = {
  heuristic: Heuristic;
  summary: string;
  proposalKind: "skill-note";
  /** The text that becomes a Learned Overlay note when approved. */
  note: string;
  evidence: { events: number; window: string; samples: string[] };
};
