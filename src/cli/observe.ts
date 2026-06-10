/**
 * Evolution loop — Observe stage, dispatcher side.
 *
 * Wraps every finished CLI run and appends its events to the local
 * log. Two hard rules:
 *
 *   1. Opt-in: nothing is recorded unless `.archik/evolution/config.yaml`
 *      says `enabled: true` (see `archik evolution enable`).
 *   2. Fail-silent: observation must never break or slow the command
 *      being observed. Every failure is swallowed.
 */
import { deriveEvents, type CommandRun } from "../domain/evolution/events.ts";
import { appendEvents, isEvolutionEnabled } from "../io/evolution-log.ts";

/**
 * Commands that are not observed: long-running processes whose exit
 * says nothing useful (dev, start, watch, mcp), and the loop's own
 * command (observing it would let the loop feed on itself).
 */
export const UNOBSERVED = new Set([
  "mcp",
  "dev",
  "start",
  "watch",
  "evolution",
  "help",
  "version",
]);

/** Flag NAMES only — values may contain paths or content. */
export function flagNames(args: string[]): string[] {
  const names: string[] = [];
  for (const arg of args) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    names.push(eq === -1 ? arg.slice(2) : arg.slice(2, eq));
  }
  return names;
}

export async function recordRun(cwd: string, run: CommandRun): Promise<void> {
  try {
    if (!(await isEvolutionEnabled(cwd))) return;
    await appendEvents(cwd, deriveEvents(run));
  } catch {
    // observation must never break the command it observes
  }
}
