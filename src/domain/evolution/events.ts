import { z } from "zod";

/**
 * Evolution loop — Observe stage.
 *
 * One CLI run produces one or more *events*. Events are the raw
 * learning signals the loop reflects on later. They are derived
 * purely from (command, subcommand, exit code) at the dispatcher,
 * so no command implementation needs to know it is being observed.
 *
 * Privacy rule: events carry command names, flag NAMES, outcomes,
 * and durations — never positional values, flag values, or file
 * contents. The log is local-only (.archik/evolution/events.jsonl).
 */

export const EVENT_TYPES = [
  "command",
  "suggest_accepted",
  "suggest_rejected",
  "validate_result",
  "drift_result",
  "proposal_approved",
  "proposal_rejected",
] as const;

export type EvolutionEventType = (typeof EVENT_TYPES)[number];

export const EvolutionEventSchema = z.object({
  v: z.literal(1),
  ts: z.string(),
  type: z.enum(EVENT_TYPES),
  command: z.string().optional(),
  sub: z.string().optional(),
  flags: z.array(z.string()).optional(),
  outcome: z.enum(["ok", "error"]).optional(),
  exitCode: z.number().int().optional(),
  durationMs: z.number().optional(),
  details: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});

export type EvolutionEvent = z.infer<typeof EvolutionEventSchema>;

/** The sanitized shape of one finished CLI run. */
export type CommandRun = {
  command: string;
  sub: string | undefined;
  flags: string[];
  exitCode: number;
  durationMs: number;
  ts: string;
};

type Derivation = {
  command: string;
  sub?: string;
  /** Exit codes this derivation fires on. */
  exitCodes: number[];
  type: EvolutionEventType;
  outcome: (exitCode: number) => "ok" | "error";
};

/**
 * Semantic derivations. Exit-code conventions across the CLI:
 *   0 = success, 1 = domain failure (invalid / drift / check failed),
 *   2 = usage error. Usage errors carry no domain signal, so most
 * derivations only fire on 0 or 1.
 */
const DERIVATIONS: Derivation[] = [
  {
    command: "suggest",
    sub: "accept",
    exitCodes: [0],
    type: "suggest_accepted",
    outcome: () => "ok",
  },
  {
    command: "suggest",
    sub: "reject",
    exitCodes: [0],
    type: "suggest_rejected",
    outcome: () => "ok",
  },
  {
    command: "validate",
    exitCodes: [0, 1],
    type: "validate_result",
    outcome: (code) => (code === 0 ? "ok" : "error"),
  },
  {
    command: "drift",
    exitCodes: [0, 1],
    type: "drift_result",
    outcome: (code) => (code === 0 ? "ok" : "error"),
  },
];

/** Map one CLI run to its events. Pure — the loop's only tap point. */
export function deriveEvents(run: CommandRun): EvolutionEvent[] {
  const commandEvent: EvolutionEvent = {
    v: 1,
    ts: run.ts,
    type: "command",
    command: run.command,
    ...(run.sub !== undefined ? { sub: run.sub } : {}),
    flags: run.flags,
    outcome: run.exitCode === 0 ? "ok" : "error",
    exitCode: run.exitCode,
    durationMs: run.durationMs,
  };
  const events: EvolutionEvent[] = [commandEvent];
  for (const d of DERIVATIONS) {
    if (d.command !== run.command) continue;
    if (d.sub !== undefined && d.sub !== run.sub) continue;
    if (!d.exitCodes.includes(run.exitCode)) continue;
    events.push({
      v: 1,
      ts: run.ts,
      type: d.type,
      command: run.command,
      ...(run.sub !== undefined ? { sub: run.sub } : {}),
      outcome: d.outcome(run.exitCode),
      exitCode: run.exitCode,
    });
  }
  return events;
}

/** Parse one JSONL line; null when corrupt or schema-invalid. */
export function parseEventLine(line: string): EvolutionEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const parsed = EvolutionEventSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
