/**
 * `archik evolution` — the self-evolution loop, first-class.
 *
 *   observe → reflect → propose → validate → apply (gated) → measure
 *
 * Subcommands:
 *   status (default)       — is observation on? counts of everything
 *   enable | disable       — opt observation in/out (config.yaml)
 *   reflect                — run heuristics over the event log; new
 *                            insights become pending proposal files
 *   proposals [show <id>]  — list / inspect proposals
 *   propose <file|->       — store an agent-authored draft proposal
 *   approve <id>           — apply with a gate: skill-notes append to
 *                            the Learned Overlay; diagram changes are
 *                            staged as a suggestion sidecar (reviewed
 *                            on the canvas, applied via suggest accept)
 *   reject <id>            — turn the proposal down (also recorded —
 *                            the loop learns from "no")
 *   report                 — 7-day trend metrics vs the week before
 *
 * Safety rails: observation is opt-in and local-only; nothing is ever
 * applied without an explicit approve; every applied change is either
 * a visible markdown note or a normal sidecar diff.
 */
import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import YAML from "yaml";
import { reflect } from "../../domain/evolution/reflect.ts";
import { buildReport } from "../../domain/evolution/metrics.ts";
import {
  ProposalSchema,
  applyRoute,
  proposalFromInsight,
  type Proposal,
} from "../../domain/evolution/proposal.ts";
import {
  appendEvents,
  appendLearned,
  isEvolutionEnabled,
  readEvents,
  readLearned,
  readProposals,
  setEvolutionEnabled,
  updateProposalStatus,
  writeProposal,
} from "../../io/evolution-log.ts";
import { suggestionPath } from "../../domain/suggestion.ts";
import { formatErrors, validateDocument } from "../../domain/validate.ts";
import { parseYaml, stringifyYaml } from "../../io/yaml.ts";
import type { Document } from "../../domain/types.ts";
import { bold, cross, cyan, dim, tick, yellow } from "../colors.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { projectRoot, resolveDocPath } from "../resolveDocPath.ts";

const isJson = (opts: ParsedOptions): boolean => {
  const v = getString(opts, "json");
  return v !== undefined && v !== "false" && v !== "0";
};

/**
 * Resolve the project root. Falls back to cwd when no archik file
 * exists yet, so `evolution enable` works in a fresh project too.
 */
async function resolveRoot(opts: ParsedOptions): Promise<{
  root: string;
  mainPath: string | null;
}> {
  try {
    const mainPath = await resolveDocPath(getString(opts, "doc"));
    return { root: projectRoot(mainPath), mainPath };
  } catch {
    return { root: process.cwd(), mainPath: null };
  }
}

async function recordLoopEvent(
  root: string,
  type: "proposal_approved" | "proposal_rejected",
  proposalId: string,
): Promise<void> {
  try {
    if (!(await isEvolutionEnabled(root))) return;
    await appendEvents(root, [
      {
        v: 1,
        ts: new Date().toISOString(),
        type,
        outcome: "ok",
        details: { proposal: proposalId },
      },
    ]);
  } catch {
    // measuring must never break the action being measured
  }
}

function countLearnedNotes(learned: string | null): number {
  if (learned === null) return 0;
  return learned.split("\n").filter((l) => l.startsWith("- ")).length;
}

async function statusCommand(
  opts: ParsedOptions,
  root: string,
): Promise<number> {
  const enabled = await isEvolutionEnabled(root);
  const { events, corruptLines } = await readEvents(root);
  const proposals = await readProposals(root);
  const pending = proposals.filter((p) => p.status === "pending");
  const learnedNotes = countLearnedNotes(await readLearned(root));
  if (isJson(opts)) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          enabled,
          events: events.length,
          corruptLines,
          proposals: {
            total: proposals.length,
            pending: pending.length,
          },
          learnedNotes,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  console.log(bold("evolution loop"));
  console.log(
    `  observe   ${enabled ? tick() + " enabled" : dim("off — run `archik evolution enable`")}`,
  );
  console.log(
    `  events    ${events.length}${corruptLines > 0 ? yellow(` (${corruptLines} corrupt lines skipped)`) : ""}`,
  );
  console.log(
    `  proposals ${proposals.length} total, ${pending.length} pending`,
  );
  console.log(`  learned   ${learnedNotes} notes`);
  if (pending.length > 0) {
    console.log("");
    console.log(`Review pending proposals: ${cyan("archik evolution proposals")}`);
  } else if (enabled && events.length > 0) {
    console.log("");
    console.log(`Look for new insights: ${cyan("archik evolution reflect")}`);
  }
  return 0;
}

async function reflectCommand(
  opts: ParsedOptions,
  root: string,
): Promise<number> {
  const json = isJson(opts);
  const { events } = await readEvents(root);
  const insights = reflect(events);
  const existing = await readProposals(root);
  const known = new Set(
    existing
      .filter((p) => p.status === "pending")
      .map((p) => p.summary),
  );
  const created: Proposal[] = [];
  const now = new Date().toISOString();
  for (const insight of insights) {
    if (known.has(insight.summary)) continue;
    const proposal = proposalFromInsight(
      insight,
      now,
      randomUUID().slice(0, 4),
    );
    await writeProposal(root, proposal);
    created.push(proposal);
  }
  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          events: events.length,
          insights: insights.length,
          created: created.map((p) => ({ id: p.id, summary: p.summary })),
        },
        null,
        2,
      ),
    );
    return 0;
  }
  console.log(
    `${insights.length} insight(s) from ${events.length} event(s); ${created.length} new proposal(s).`,
  );
  for (const p of created) {
    console.log(`  ${cyan(p.id)}  ${p.summary}`);
  }
  if (created.length > 0) {
    console.log("");
    console.log(`Review: ${cyan("archik evolution proposals")}`);
    console.log(`Apply:  ${cyan("archik evolution approve <id>")}`);
  }
  return 0;
}

async function proposalsCommand(
  opts: ParsedOptions,
  root: string,
): Promise<number> {
  const json = isJson(opts);
  const proposals = await readProposals(root);
  const showId = opts._[1];
  if (showId === "show" || showId !== undefined) {
    const id = showId === "show" ? opts._[2] : undefined;
    if (showId === "show" && id !== undefined) {
      const p = proposals.find((x) => x.id === id);
      if (p === undefined) {
        console.error(`${cross()} no proposal with id "${id}"`);
        return 2;
      }
      console.log(json ? JSON.stringify(p, null, 2) : YAML.stringify(p));
      return 0;
    }
  }
  if (json) {
    console.log(JSON.stringify({ ok: true, proposals }, null, 2));
    return 0;
  }
  if (proposals.length === 0) {
    console.log(
      `No proposals yet. Run ${cyan("archik evolution reflect")} after some usage.`,
    );
    return 0;
  }
  for (const p of proposals) {
    const badge =
      p.status === "pending"
        ? yellow("pending ")
        : p.status === "applied"
          ? tick() + " applied"
          : dim(p.status.padEnd(8));
    console.log(`  ${badge}  ${cyan(p.id)}  [${p.kind}] ${p.summary}`);
  }
  return 0;
}

/** Build the post-change document for a sidecar-routed proposal. */
function applyToDocument(
  doc: Document,
  proposal: Proposal,
): { doc: Document } | { error: string } {
  if (proposal.kind === "update-node") {
    const payload = proposal.payload as { nodeId: string; set: Record<string, string> };
    const node = doc.nodes.find((n) => n.id === payload.nodeId);
    if (node === undefined) {
      return { error: `node "${payload.nodeId}" not found in the main document` };
    }
    const nodes = doc.nodes.map((n) =>
      n.id === payload.nodeId ? { ...n, ...payload.set } : n,
    );
    return { doc: { ...doc, nodes: nodes as Document["nodes"] } };
  }
  if (proposal.kind === "add-exception") {
    const payload = proposal.payload as { constraintId: string; exceptId: string };
    const constraints = doc.constraints ?? [];
    const target = constraints.find((c) => c.id === payload.constraintId);
    if (target === undefined) {
      return { error: `constraint "${payload.constraintId}" not found` };
    }
    const updated = constraints.map((c) =>
      c.id === payload.constraintId
        ? { ...c, except: [...(c.except ?? []), payload.exceptId] }
        : c,
    );
    return { doc: { ...doc, constraints: updated as Document["constraints"] } };
  }
  return { error: `kind "${proposal.kind}" does not route to the sidecar` };
}

async function stageSidecar(
  mainPath: string,
  proposal: Proposal,
): Promise<{ sidecar: string } | { error: string }> {
  const sidecar = suggestionPath(mainPath);
  if (existsSync(sidecar)) {
    return {
      error:
        `a suggestion sidecar already exists (${path.basename(sidecar)}). ` +
        `Resolve it first: archik suggest accept | reject`,
    };
  }
  let mainDoc: Document;
  try {
    mainDoc = parseYaml(await readFile(mainPath, "utf-8"));
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  const applied = applyToDocument(mainDoc, proposal);
  if ("error" in applied) return applied;

  const validated = validateDocument(applied.doc);
  if (!validated.ok) {
    return { error: `resulting document is invalid:\n${formatErrors(validated.errors)}` };
  }
  const stamped: Document = {
    ...validated.value,
    metadata: {
      ...(validated.value.metadata ?? {}),
      suggestion: {
        from: path.basename(mainPath),
        at: new Date().toISOString(),
        note: `evolution proposal ${proposal.id}: ${proposal.summary}`,
      },
    },
  };
  const tmp = `${sidecar}.tmp`;
  await writeFile(tmp, stringifyYaml(stamped), "utf-8");
  await rename(tmp, sidecar);
  return { sidecar };
}

async function approveCommand(
  opts: ParsedOptions,
  root: string,
  mainPath: string | null,
): Promise<number> {
  const id = opts._[1];
  if (id === undefined) {
    console.error(`${cross()} usage: archik evolution approve <id>`);
    return 2;
  }
  const proposals = await readProposals(root);
  const proposal = proposals.find((p) => p.id === id);
  if (proposal === undefined) {
    console.error(`${cross()} no proposal with id "${id}"`);
    return 2;
  }
  if (proposal.status !== "pending") {
    console.error(
      `${cross()} proposal "${id}" is ${proposal.status}, not pending`,
    );
    return 1;
  }

  const route = applyRoute(proposal);
  if (route === "learned-overlay") {
    const note = (proposal.payload as { note: string }).note;
    await updateProposalStatus(root, id, "approved");
    await appendLearned(root, note, id);
    await updateProposalStatus(root, id, "applied");
    await recordLoopEvent(root, "proposal_approved", id);
    console.log(`${tick()} applied — note added to .archik/evolution/learned.md`);
    return 0;
  }

  // suggestion-sidecar route — the gate has a second human step:
  // the change must still go through `archik suggest accept`.
  if (mainPath === null) {
    console.error(
      `${cross()} no architecture file found — cannot stage a sidecar`,
    );
    return 1;
  }
  const staged = await stageSidecar(mainPath, proposal);
  if ("error" in staged) {
    console.error(`${cross()} ${staged.error}`);
    return 1;
  }
  await updateProposalStatus(root, id, "approved");
  await recordLoopEvent(root, "proposal_approved", id);
  console.log(`${tick()} staged → ${path.basename(staged.sidecar)}`);
  console.log("");
  console.log("Review on the canvas, or:");
  console.log(`  ${cyan("archik suggest show")}`);
  console.log(`  ${cyan("archik suggest accept")}   (this completes the apply)`);
  return 0;
}

async function rejectCommand(
  opts: ParsedOptions,
  root: string,
): Promise<number> {
  const id = opts._[1];
  if (id === undefined) {
    console.error(`${cross()} usage: archik evolution reject <id>`);
    return 2;
  }
  try {
    await updateProposalStatus(root, id, "rejected");
  } catch (err) {
    console.error(`${cross()} ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
  await recordLoopEvent(root, "proposal_rejected", id);
  console.log(`${tick()} rejected ${id}`);
  return 0;
}

async function proposeCommand(
  opts: ParsedOptions,
  root: string,
): Promise<number> {
  const draftArg = opts._[1];
  if (draftArg === undefined) {
    console.error(`${cross()} usage: archik evolution propose <file|->`);
    return 2;
  }
  let text: string;
  try {
    text =
      draftArg === "-"
        ? await readStdin()
        : await readFile(path.resolve(process.cwd(), draftArg), "utf-8");
  } catch (err) {
    console.error(`${cross()} cannot read draft: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  let raw: unknown;
  try {
    raw = YAML.parse(text);
  } catch (err) {
    console.error(`${cross()} ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const now = new Date().toISOString();
  const candidate = {
    ...(typeof raw === "object" && raw !== null ? raw : {}),
    id: `p-${now.slice(0, 10)}-${randomUUID().slice(0, 4)}`,
    createdAt: now,
    status: "pending",
  } as Record<string, unknown>;
  if (candidate.evidence === undefined) {
    candidate.evidence = { events: 0, window: "agent", samples: [] };
  }
  const parsed = ProposalSchema.safeParse(candidate);
  if (!parsed.success) {
    console.error(`${cross()} draft is not a valid proposal:`);
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    return 1;
  }
  await writeProposal(root, parsed.data);
  console.log(`${tick()} stored ${cyan(parsed.data.id)} (pending)`);
  console.log(`Apply: ${cyan(`archik evolution approve ${parsed.data.id}`)}`);
  return 0;
}

async function reportCommand(
  opts: ParsedOptions,
  root: string,
): Promise<number> {
  const { events } = await readEvents(root);
  const report = buildReport(events, new Date());
  if (isJson(opts)) {
    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
    return 0;
  }
  const fmt = (n: number | null): string =>
    n === null ? dim("—") : `${Math.round(n * 100)}%`;
  const { current, previous } = report.window;
  console.log(bold("evolution report") + dim("  (last 7 days vs the 7 before)"));
  console.log(`  commands run      ${current.commands}  ${dim(`was ${previous.commands}`)}`);
  console.log(`  error rate        ${fmt(current.errorRate)}  ${dim(`was ${fmt(previous.errorRate)}`)}`);
  console.log(`  acceptance rate   ${fmt(current.acceptanceRate)}  ${dim(`was ${fmt(previous.acceptanceRate)}`)}`);
  console.log(`  validate errors   ${current.validateErrors}  ${dim(`was ${previous.validateErrors}`)}`);
  console.log(`  drift errors      ${current.driftErrors}  ${dim(`was ${previous.driftErrors}`)}`);
  console.log(`  proposals applied ${current.proposalsApplied}  ${dim(`was ${previous.proposalsApplied}`)}`);
  return 0;
}

function printEvolutionHelp(): void {
  console.log(`archik evolution — the self-evolution loop

The loop: observe → reflect → propose → validate → apply → measure.
Observation is OPT-IN and local-only (.archik/evolution/events.jsonl).
Nothing is ever applied without an explicit approve.

USAGE
  archik evolution status            counts + whether observation is on
  archik evolution enable|disable    opt observation in / out
  archik evolution reflect           heuristics over the log → proposals
  archik evolution proposals         list proposals
  archik evolution proposals show <id>
  archik evolution propose <file|->  store an agent-authored proposal
  archik evolution approve <id>      apply (gated; sidecar for diagram changes)
  archik evolution reject <id>       decline (recorded — the loop learns)
  archik evolution report            7-day trends vs the week before

All subcommands accept --json.
`);
}

export async function evolutionCommand(opts: ParsedOptions): Promise<number> {
  const sub = opts._[0] ?? "status";
  const { root, mainPath } = await resolveRoot(opts);
  switch (sub) {
    case "status":
      return statusCommand(opts, root);
    case "enable":
      await setEvolutionEnabled(root, true);
      console.log(`${tick()} observation enabled (local-only, .archik/evolution/)`);
      return 0;
    case "disable":
      await setEvolutionEnabled(root, false);
      console.log(`${tick()} observation disabled`);
      return 0;
    case "reflect":
      return reflectCommand(opts, root);
    case "proposals":
      return proposalsCommand(opts, root);
    case "propose":
      return proposeCommand(opts, root);
    case "approve":
      return approveCommand(opts, root, mainPath);
    case "reject":
      return rejectCommand(opts, root);
    case "report":
      return reportCommand(opts, root);
    case "help":
    case "--help":
    case "-h":
      printEvolutionHelp();
      return 0;
    default:
      console.error(`${cross()} unknown evolution subcommand: ${sub}\n`);
      printEvolutionHelp();
      return 2;
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}
