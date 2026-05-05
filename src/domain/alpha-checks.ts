/**
 * Per-(alpha, state) machine checks. Each function returns
 *   { ok: true }                  — claim verifiable
 *   { ok: false, reason: "..." }  — claim NOT verifiable, with reason
 *   null                          — state is subjective; promote
 *                                   succeeds without a check (the
 *                                   user is attesting)
 *
 * The `evaluateAlphaState` entry point centralises the dispatch so
 * both `alpha show` (re-runs every check against the claimed state)
 * and `alpha promote` (only checks the target state) share one
 * source of truth.
 */
import type { LoadedDoc } from "../io/discovery.ts";
import type { LoadedSeqDoc } from "../io/seq-discovery.ts";
import type { LoadedActorDoc } from "../io/actor-discovery.ts";
import type { LoadedUseCaseDoc } from "../io/usecase-discovery.ts";
import { buildTraceMatrix } from "./trace.ts";
import { isCodeBearing } from "./taxonomy.ts";
import type { AlphaName } from "./alpha-schema.ts";

export type CheckResult = { ok: true } | { ok: false; reason: string };

export type AlphaCheckContext = {
  archDocs: LoadedDoc[];
  ucDocs: LoadedUseCaseDoc[];
  seqDocs: LoadedSeqDoc[];
  actorDocs: LoadedActorDoc[];
  /** Resolves a project-relative path against the project root. Used
   *  for "sourcePath / test path exists on disk" checks. */
  fileExists: (relPath: string) => boolean;
};

const ok = (): CheckResult => ({ ok: true });
const fail = (reason: string): CheckResult => ({ ok: false, reason });

// ---------- stakeholders ----------

function stakeholdersChecks(): Record<
  string,
  ((ctx: AlphaCheckContext) => CheckResult) | null
> {
  return {
    recognised: (ctx) => {
      const total = ctx.actorDocs.reduce(
        (acc, d) => acc + d.doc.actors.length,
        0,
      );
      return total === 0
        ? fail("No actors defined; create a *.archik.actors.yaml file.")
        : ok();
    },
    represented: (ctx) => {
      const humanActors = ctx.actorDocs.flatMap((d) =>
        d.doc.actors.filter((a) => a.kind === "human"),
      );
      return humanActors.length === 0
        ? fail(
            "No human actor defined; \"represented\" needs at least one " +
              "actor with kind: human in a *.archik.actors.yaml file.",
          )
        : ok();
    },
    involved: null,
    "in-agreement": null,
    "satisfied-for-deployment": null,
    "satisfied-in-use": null,
  };
}

// ---------- requirements ----------

function requirementsChecks(): Record<
  string,
  ((ctx: AlphaCheckContext) => CheckResult) | null
> {
  return {
    conceived: (ctx) =>
      ctx.ucDocs.length === 0
        ? fail(
            "No use cases defined; create a *.archik.uc.yaml file under " +
              ".archik/usecases/.",
          )
        : ok(),
    bounded: (ctx) => {
      if (ctx.ucDocs.length === 0) {
        return fail("No use cases to bound.");
      }
      const actorIds = new Set(
        ctx.actorDocs.flatMap((d) => d.doc.actors.map((a) => a.id)),
      );
      const unresolved: string[] = [];
      for (const { doc, relPath } of ctx.ucDocs) {
        if (!actorIds.has(doc.primaryActor)) {
          unresolved.push(
            `${doc.id} (${relPath}): primaryActor "${doc.primaryActor}" not defined in any *.archik.actors.yaml`,
          );
        }
      }
      return unresolved.length === 0
        ? ok()
        : fail(
            `Use cases with unresolved primaryActor: ${unresolved.join("; ")}.`,
          );
    },
    coherent: (ctx) => {
      if (ctx.ucDocs.length === 0) {
        return fail("No use cases to make coherent.");
      }
      const seen = new Map<string, string>(); // ucId → relPath of first definition
      const duplicates: string[] = [];
      for (const { doc, relPath } of ctx.ucDocs) {
        const first = seen.get(doc.id);
        if (first !== undefined) {
          duplicates.push(`"${doc.id}" defined in both ${first} and ${relPath}`);
        } else {
          seen.set(doc.id, relPath);
        }
      }
      return duplicates.length === 0
        ? ok()
        : fail(`Duplicate use case IDs: ${duplicates.join("; ")}.`);
    },
    acceptable: (ctx) => {
      // Every active slice must have ≥ 1 test path that exists on disk.
      const missing: string[] = [];
      for (const { doc, relPath } of ctx.ucDocs) {
        for (const slice of doc.slices) {
          const isPlanned =
            slice.status === "proposed" || slice.status === "deprecated";
          if (isPlanned) continue;
          if (slice.tests === undefined || slice.tests.length === 0) {
            missing.push(`${doc.id}/${slice.id} (${relPath}): no tests`);
            continue;
          }
          for (const t of slice.tests) {
            if (!ctx.fileExists(t)) {
              missing.push(
                `${doc.id}/${slice.id} (${relPath}): test "${t}" missing on disk`,
              );
            }
          }
        }
      }
      return missing.length === 0
        ? ok()
        : fail(
            `Active slices without on-disk tests: ${missing.join("; ")}.`,
          );
    },
    addressed: (ctx) => {
      // Every active slice must have a realization.seqFile that
      // resolves against the discovered seq files.
      const seqByRel = new Set(ctx.seqDocs.map((d) => d.relPath));
      const missing: string[] = [];
      for (const { doc, relPath } of ctx.ucDocs) {
        for (const slice of doc.slices) {
          const isPlanned =
            slice.status === "proposed" || slice.status === "deprecated";
          if (isPlanned) continue;
          if (slice.realization === undefined) {
            missing.push(
              `${doc.id}/${slice.id} (${relPath}): no realization.seqFile`,
            );
            continue;
          }
          if (!seqByRel.has(slice.realization.seqFile)) {
            missing.push(
              `${doc.id}/${slice.id} (${relPath}): realization.seqFile ` +
                `"${slice.realization.seqFile}" not found`,
            );
          }
        }
      }
      return missing.length === 0
        ? ok()
        : fail(
            `Active slices without realization seq diagrams: ${missing.join("; ")}.`,
          );
    },
    fulfilled: null,
  };
}

// ---------- softwareSystem ----------

function softwareSystemChecks(): Record<
  string,
  ((ctx: AlphaCheckContext) => CheckResult) | null
> {
  return {
    "architecture-selected": (ctx) => {
      const totalNodes = ctx.archDocs.reduce(
        (acc, d) => acc + d.doc.nodes.length,
        0,
      );
      return totalNodes === 0
        ? fail("No architecture nodes defined; populate main.archik.yaml.")
        : ok();
    },
    demonstrable: (ctx) => {
      // Proxy: every active code-bearing node has sourcePath that
      // resolves on disk (drift-clean). Mirrors `archik drift` for
      // the active-only subset; covers the "you can demo it" claim.
      const orphans: string[] = [];
      for (const { doc, relPath } of ctx.archDocs) {
        for (const node of doc.nodes) {
          if (!isCodeBearing(node.kind)) continue;
          if (node.status === "proposed" || node.status === "deprecated") {
            continue;
          }
          if (node.sourcePath === undefined) {
            orphans.push(`${node.id} (${relPath}): no sourcePath`);
            continue;
          }
          if (!ctx.fileExists(node.sourcePath)) {
            orphans.push(
              `${node.id} (${relPath}): sourcePath "${node.sourcePath}" ` +
                `missing on disk`,
            );
          }
        }
      }
      return orphans.length === 0
        ? ok()
        : fail(
            `Active code-bearing nodes without on-disk source: ${orphans.join("; ")}.`,
          );
    },
    usable: (ctx) => {
      // Every active slice must have ≥ 1 test path that exists on disk.
      // Distinct from demonstrable (sourcePaths exist) and ready (fully
      // traced): usable means the delivered behaviour is covered by tests
      // — the system can be trusted for daily use, not just shown.
      if (ctx.ucDocs.length === 0) {
        return fail(
          "No use cases defined; \"usable\" requires tested behaviour.",
        );
      }
      const missing: string[] = [];
      for (const { doc, relPath } of ctx.ucDocs) {
        for (const slice of doc.slices) {
          const isPlanned =
            slice.status === "proposed" || slice.status === "deprecated";
          if (isPlanned) continue;
          if (slice.tests === undefined || slice.tests.length === 0) {
            missing.push(`${doc.id}/${slice.id} (${relPath}): no tests`);
            continue;
          }
          for (const t of slice.tests) {
            if (!ctx.fileExists(t)) {
              missing.push(
                `${doc.id}/${slice.id} (${relPath}): test "${t}" missing on disk`,
              );
            }
          }
        }
      }
      return missing.length === 0
        ? ok()
        : fail(
            `Active slices without on-disk tests: ${missing.join("; ")}.`,
          );
    },
    ready: (ctx) => {
      // Every active slice in the trace matrix is `level: full`.
      const matrix = buildTraceMatrix(
        ctx.ucDocs,
        ctx.seqDocs,
        ctx.archDocs,
      );
      const notFull = matrix.rows.filter(
        (r) => r.status === "active" && r.level !== "full",
      );
      if (notFull.length === 0) return ok();
      const sample = notFull
        .slice(0, 5)
        .map((r) => `${r.useCase}/${r.slice} (${r.level})`)
        .join(", ");
      const more = notFull.length > 5 ? `, +${notFull.length - 5} more` : "";
      return fail(
        `Trace matrix has ${notFull.length} active slice(s) below "full": ${sample}${more}. ` +
          `Run \`archik trace\` for the full picture.`,
      );
    },
    operational: null,
    retired: null,
  };
}

// ---------- work ----------

function workChecks(): Record<
  string,
  ((ctx: AlphaCheckContext) => CheckResult) | null
> {
  return {
    initiated: () => ok(), // any alphas file at all proves work was initiated
    prepared: (ctx) => {
      const anyProposed = ctx.ucDocs.some((d) =>
        d.doc.slices.some((s) => s.status === "proposed"),
      );
      const anyUseCase = ctx.ucDocs.length > 0;
      if (!anyUseCase) {
        return fail("No use cases defined; nothing has been prepared.");
      }
      if (!anyProposed) {
        // Not a hard fail: a project that goes straight to active
        // slices has implicitly skipped "prepared". Surface that as
        // info but allow the claim — Essence treats this as a soft
        // ratchet.
        return ok();
      }
      return ok();
    },
    started: (ctx) => {
      const anyActive = ctx.ucDocs.some((d) =>
        d.doc.slices.some((s) => (s.status ?? "active") === "active"),
      );
      return anyActive
        ? ok()
        : fail(
            "No active slices; \"started\" requires at least one slice " +
              "with status active (or absent, which defaults to active).",
          );
    },
    // "under-control" needs the kind of evidence archik can't gather
    // on its own (CI history, PR cadence, escalation procedures). Marking
    // it subjective so the user attests; the canvas / show output flags
    // it with `?` rather than a misleading ✓. A future milestone could
    // add a real check that runs the validator + drift + tests inline.
    "under-control": null,
    concluded: null,
    closed: null,
  };
}

const CHECKS: Record<
  AlphaName,
  Record<string, ((ctx: AlphaCheckContext) => CheckResult) | null>
> = {
  stakeholders: stakeholdersChecks(),
  requirements: requirementsChecks(),
  softwareSystem: softwareSystemChecks(),
  work: workChecks(),
};

/** True when this (alpha, state) has a machine-checkable condition. */
export function hasCheck(alpha: AlphaName, state: string): boolean {
  return CHECKS[alpha][state] !== undefined && CHECKS[alpha][state] !== null;
}

/** Run the check for one (alpha, state). Returns null when subjective. */
export function evaluateAlphaState(
  alpha: AlphaName,
  state: string,
  ctx: AlphaCheckContext,
): CheckResult | null {
  const check = CHECKS[alpha][state];
  if (check === undefined) {
    return fail(`Unknown state "${state}" for alpha "${alpha}".`);
  }
  if (check === null) return null;
  return check(ctx);
}
