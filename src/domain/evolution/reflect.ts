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

export type ReflectOptions = { threshold?: number };

const DEFAULT_THRESHOLD = 3;
const MAX_SAMPLES = 3;

function evidenceOf(matched: EvolutionEvent[]): Insight["evidence"] {
  return {
    events: matched.length,
    window: "all",
    samples: matched
      .slice(-MAX_SAMPLES)
      .map((e) => `${e.ts} ${e.type}${e.command ? ` ${e.command}` : ""}`),
  };
}

/** Turn the event log into insights. Caller controls the window. */
export function reflect(
  events: EvolutionEvent[],
  opts: ReflectOptions = {},
): Insight[] {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const insights: Insight[] = [];

  const rejects = events.filter((e) => e.type === "suggest_rejected");
  const accepts = events.filter((e) => e.type === "suggest_accepted");
  if (rejects.length >= threshold && rejects.length > accepts.length) {
    insights.push({
      heuristic: "rejection-streak",
      summary: `Suggestions were rejected ${rejects.length} times (${accepts.length} accepted).`,
      proposalKind: "skill-note",
      note:
        "Recent architecture suggestions are mostly rejected. Propose smaller, " +
        "more focused diffs, and ask the user about intent before staging large changes.",
      evidence: evidenceOf(rejects),
    });
  }

  const validateErrors = events.filter(
    (e) => e.type === "validate_result" && e.outcome === "error",
  );
  if (validateErrors.length >= threshold) {
    insights.push({
      heuristic: "recurring-validation-errors",
      summary: `Validation failed ${validateErrors.length} times.`,
      proposalKind: "skill-note",
      note:
        "Validation keeps failing. Run `archik validate` before staging a suggestion, " +
        "and read the reported rule before retrying the same change.",
      evidence: evidenceOf(validateErrors),
    });
  }

  const driftErrors = events.filter(
    (e) => e.type === "drift_result" && e.outcome === "error",
  );
  if (driftErrors.length >= threshold) {
    insights.push({
      heuristic: "recurring-drift",
      summary: `Drift checks failed ${driftErrors.length} times.`,
      proposalKind: "skill-note",
      note:
        "The diagram keeps drifting from the code. When code moves, update the node's " +
        "`sourcePath` in the same change, and run `archik drift` before finishing a task.",
      evidence: evidenceOf(driftErrors),
    });
  }

  // validate/drift failures are domain signals handled above, not tool failures.
  const EXCLUDED = new Set(["validate", "drift"]);
  const failuresByCommand = new Map<string, EvolutionEvent[]>();
  for (const e of events) {
    if (e.type !== "command" || e.outcome !== "error") continue;
    if (e.command === undefined || EXCLUDED.has(e.command)) continue;
    const list = failuresByCommand.get(e.command) ?? [];
    list.push(e);
    failuresByCommand.set(e.command, list);
  }
  for (const [command, failures] of failuresByCommand) {
    if (failures.length < threshold) continue;
    insights.push({
      heuristic: "failing-command",
      summary: `\`archik ${command}\` failed ${failures.length} times.`,
      proposalKind: "skill-note",
      note:
        `\`archik ${command}\` keeps failing in this project. Check its --help and the ` +
        "project setup before retrying, and prefer a different verified workflow if it persists.",
      evidence: evidenceOf(failures),
    });
  }

  return insights;
}
