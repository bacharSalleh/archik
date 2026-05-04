/**
 * Trace matrix — the end-to-end view of "is this use case actually
 * delivered?" Walks every slice in every use case file and threads
 * the chain through to tests, sequence diagrams, and architecture
 * nodes, producing one row per slice with a coverage flag set.
 *
 * Pure function: takes already-loaded documents, returns rows. The
 * CLI wrapper (`src/cli/commands/trace.ts`) handles discovery,
 * filtering, formatting, and exit-code semantics.
 *
 * Coverage semantics (per slice):
 *   • hasTests        — slice declares ≥ 1 test path.
 *   • hasRealization  — slice has a `realization.seqFile` AND that
 *                       seq file was discovered on disk.
 *   • hasStereotypes  — every participant in the realisation seq's
 *                       architecture node has a `stereotype`. Empty
 *                       participant list counts as false (nothing to
 *                       analyse).
 *   • fullyTraced     — hasTests && hasRealization && hasStereotypes,
 *                       AND slice status is active (or absent, which
 *                       defaults to active).
 *
 * Coverage classification (per slice):
 *   • full    — fullyTraced.
 *   • partial — at least one of hasTests / hasRealization is true,
 *               but not fullyTraced.
 *   • none    — neither tests nor realization.
 */
import type { LoadedDoc } from "../io/discovery.ts";
import type { LoadedSeqDoc } from "../io/seq-discovery.ts";
import type { LoadedUseCaseDoc } from "../io/usecase-discovery.ts";
import type { SeqStep } from "./seq-schema.ts";
import type { Node } from "./types.ts";

export type Stereotype = "boundary" | "control" | "entity";

export type TraceParticipant = {
  participantId: string;
  nodeId: string;
  stereotype?: Stereotype;
};

export type TraceRealization = {
  seqFile: string;
  seqName: string;
  participants: TraceParticipant[];
  messageCount: number;
};

export type TraceCoverage = {
  hasTests: boolean;
  hasRealization: boolean;
  hasStereotypes: boolean;
  fullyTraced: boolean;
};

export type TraceLevel = "full" | "partial" | "none";

export type TraceRow = {
  useCase: string;
  useCaseName: string;
  useCaseFile: string;
  slice: string;
  sliceDescription: string;
  status: "active" | "proposed" | "deprecated";
  primaryActor: string;
  secondaryActors: string[];
  tests: string[];
  realization: TraceRealization | null;
  coverage: TraceCoverage;
  level: TraceLevel;
};

export type TraceMatrix = {
  rows: TraceRow[];
  summary: {
    useCases: number;
    slices: number;
    fullyTraced: number;
    partial: number;
    untraced: number;
  };
};

function countMessages(steps: SeqStep[]): number {
  let n = 0;
  for (const step of steps) {
    if (step.type === "message") n++;
    else if (step.type === "group" && step.branches) {
      for (const b of step.branches) n += countMessages(b.steps);
    }
  }
  return n;
}

function classify(coverage: TraceCoverage): TraceLevel {
  if (coverage.fullyTraced) return "full";
  if (coverage.hasTests || coverage.hasRealization) return "partial";
  return "none";
}

export function buildTraceMatrix(
  ucDocs: LoadedUseCaseDoc[],
  seqDocs: LoadedSeqDoc[],
  archDocs: LoadedDoc[],
): TraceMatrix {
  // Index seq files by relPath; index every architecture node by id
  // so participant.nodeId → stereotype is O(1).
  const seqByRel = new Map<string, LoadedSeqDoc>();
  for (const s of seqDocs) seqByRel.set(s.relPath, s);

  const nodeById = new Map<string, Node>();
  for (const { doc } of archDocs) {
    for (const n of doc.nodes) nodeById.set(n.id, n);
  }

  const rows: TraceRow[] = [];
  for (const { relPath, doc } of ucDocs) {
    for (const slice of doc.slices) {
      const status = slice.status ?? "active";
      const tests = slice.tests ?? [];
      const hasTests = tests.length > 0;

      let realization: TraceRealization | null = null;
      let hasRealization = false;
      let hasStereotypes = false;

      if (slice.realization !== undefined) {
        const seq = seqByRel.get(slice.realization.seqFile);
        if (seq !== undefined) {
          hasRealization = true;
          const participants: TraceParticipant[] = seq.doc.participants.map(
            (p) => {
              const node = nodeById.get(p.nodeId);
              const tp: TraceParticipant = {
                participantId: p.id,
                nodeId: p.nodeId,
              };
              if (node?.stereotype !== undefined) {
                tp.stereotype = node.stereotype;
              }
              return tp;
            },
          );
          hasStereotypes =
            participants.length > 0 &&
            participants.every((p) => p.stereotype !== undefined);
          realization = {
            seqFile: slice.realization.seqFile,
            seqName: seq.doc.name,
            participants,
            messageCount: countMessages(seq.doc.steps),
          };
        }
      }

      const coverage: TraceCoverage = {
        hasTests,
        hasRealization,
        hasStereotypes,
        fullyTraced:
          hasTests &&
          hasRealization &&
          hasStereotypes &&
          status === "active",
      };

      rows.push({
        useCase: doc.id,
        useCaseName: doc.name,
        useCaseFile: relPath,
        slice: slice.id,
        sliceDescription: slice.description,
        status,
        primaryActor: doc.primaryActor,
        secondaryActors: doc.secondaryActors ?? [],
        tests,
        realization,
        coverage,
        level: classify(coverage),
      });
    }
  }

  const summary = {
    useCases: ucDocs.length,
    slices: rows.length,
    fullyTraced: rows.filter((r) => r.level === "full").length,
    partial: rows.filter((r) => r.level === "partial").length,
    untraced: rows.filter((r) => r.level === "none").length,
  };

  return { rows, summary };
}
