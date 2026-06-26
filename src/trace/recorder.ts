/**
 * Concrete-trace recorder — shipped to user test suites as `archik/trace`.
 * ZERO runtime dependencies (node:fs + node:path only): it builds a plain
 * object and writes JSON. Validation happens on archik's side when the
 * file is discovered, so this stays dependency-free and cheap to import.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { TraceDocument, TraceStep } from "../domain/trace-schema.ts";

export type TraceStepInput = {
  id?: string;
  from: string;
  to: string;
  label: string;
  in?: unknown;
  out?: unknown;
  status?: "ok" | "error";
};

export type TraceRecorder = {
  step(s: TraceStepInput): TraceRecorder;
  flush(): void;
};

/** Walk up from `start` for a directory containing `.archik`; fall back
 *  to `start` itself so a project without one still writes somewhere. */
function findProjectRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 30; i++) {
    if (existsSync(path.join(dir, ".archik"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

export function trace(opts: {
  useCase: string;
  slice: string;
  seqFile?: string;
}): TraceRecorder {
  const steps: TraceStep[] = [];
  let flushed = false;

  const onExit = (): void => recorder.flush();

  const recorder: TraceRecorder = {
    step(s: TraceStepInput): TraceRecorder {
      const data =
        s.in !== undefined || s.out !== undefined
          ? {
              ...(s.in !== undefined ? { in: s.in } : {}),
              ...(s.out !== undefined ? { out: s.out } : {}),
            }
          : undefined;
      steps.push({
        ...(s.id !== undefined ? { id: s.id } : {}),
        from: s.from,
        to: s.to,
        label: s.label,
        ...(data !== undefined ? { data } : {}),
        status: s.status ?? "ok",
      });
      return recorder;
    },
    flush(): void {
      if (flushed) return;
      flushed = true;
      const root = findProjectRoot(process.cwd());
      const dir = path.join(root, ".archik", "traces");
      mkdirSync(dir, { recursive: true });
      const doc: TraceDocument = {
        version: "1.0",
        useCase: opts.useCase,
        slice: opts.slice,
        ...(opts.seqFile !== undefined ? { seqFile: opts.seqFile } : {}),
        recordedAt: new Date().toISOString(),
        steps,
      };
      const file = path.join(dir, `${opts.useCase}.${opts.slice}.archik.trace.json`);
      writeFileSync(file, JSON.stringify(doc, null, 2) + "\n", "utf-8");
      process.removeListener("exit", onExit);
    },
  };

  // Write once when the test process exits, so a forgotten flush() still
  // produces a trace and partial state is never written mid-run.
  process.on("exit", onExit);
  return recorder;
}
