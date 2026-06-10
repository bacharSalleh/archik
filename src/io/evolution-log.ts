import { appendFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import YAML from "yaml";
import {
  parseEventLine,
  type EvolutionEvent,
} from "../domain/evolution/events.ts";
import {
  ProposalSchema,
  canTransition,
  type Proposal,
  type ProposalStatus,
} from "../domain/evolution/proposal.ts";

/**
 * Disk layout of the evolution loop, all under <root>/.archik/evolution/:
 *
 *   config.yaml        — { enabled: true } turns observation on (opt-in)
 *   events.jsonl       — append-only event log, local-only
 *   learned.md         — the Learned Overlay (approved skill-notes)
 *   proposals/<id>.yaml — one file per proposal, auditable in review
 */

export function evolutionDir(root: string): string {
  return path.join(root, ".archik", "evolution");
}

const configPath = (root: string): string =>
  path.join(evolutionDir(root), "config.yaml");
const eventsPath = (root: string): string =>
  path.join(evolutionDir(root), "events.jsonl");
const learnedPath = (root: string): string =>
  path.join(evolutionDir(root), "learned.md");
const proposalsDir = (root: string): string =>
  path.join(evolutionDir(root), "proposals");

async function atomicWrite(abs: string, text: string): Promise<void> {
  await mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.archik-tmp-${randomUUID().slice(0, 8)}`;
  await writeFile(tmp, text, "utf-8");
  await rename(tmp, abs);
}

export async function isEvolutionEnabled(root: string): Promise<boolean> {
  let text: string;
  try {
    text = await readFile(configPath(root), "utf-8");
  } catch {
    return false;
  }
  try {
    const parsed: unknown = YAML.parse(text);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { enabled?: unknown }).enabled === true
    );
  } catch {
    return false;
  }
}

export async function setEvolutionEnabled(
  root: string,
  on: boolean,
): Promise<void> {
  await atomicWrite(configPath(root), YAML.stringify({ enabled: on }));
}

export async function appendEvents(
  root: string,
  events: EvolutionEvent[],
): Promise<void> {
  if (events.length === 0) return;
  await mkdir(evolutionDir(root), { recursive: true });
  const lines = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await appendFile(eventsPath(root), lines, "utf-8");
}

export async function readEvents(
  root: string,
): Promise<{ events: EvolutionEvent[]; corruptLines: number }> {
  let text: string;
  try {
    text = await readFile(eventsPath(root), "utf-8");
  } catch {
    return { events: [], corruptLines: 0 };
  }
  const events: EvolutionEvent[] = [];
  let corruptLines = 0;
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    const parsed = parseEventLine(line);
    if (parsed === null) corruptLines += 1;
    else events.push(parsed);
  }
  return { events, corruptLines };
}

const LEARNED_HEADER = `# Learned

Approved knowledge the system gathered from its own usage.
Read by the archik skill and the MCP \`archik://learned\` resource.
Each note traces back to a proposal id and its evidence.
`;

export async function appendLearned(
  root: string,
  note: string,
  proposalId: string,
): Promise<void> {
  const abs = learnedPath(root);
  let existing: string | null = null;
  try {
    existing = await readFile(abs, "utf-8");
  } catch {
    existing = null;
  }
  const date = new Date().toISOString().slice(0, 10);
  const entry = `\n- ${note} _(${date}, ${proposalId})_\n`;
  await atomicWrite(abs, (existing ?? LEARNED_HEADER) + entry);
}

export async function readLearned(root: string): Promise<string | null> {
  try {
    return await readFile(learnedPath(root), "utf-8");
  } catch {
    return null;
  }
}

const proposalPath = (root: string, id: string): string =>
  path.join(proposalsDir(root), `${id}.yaml`);

export async function writeProposal(
  root: string,
  proposal: Proposal,
): Promise<string> {
  const validated = ProposalSchema.parse(proposal);
  const abs = proposalPath(root, validated.id);
  await atomicWrite(abs, YAML.stringify(validated));
  return abs;
}

export async function readProposals(root: string): Promise<Proposal[]> {
  let names: string[];
  try {
    names = await readdir(proposalsDir(root));
  } catch {
    return [];
  }
  const proposals: Proposal[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".yaml")) continue;
    try {
      const text = await readFile(
        path.join(proposalsDir(root), name),
        "utf-8",
      );
      const parsed = ProposalSchema.safeParse(YAML.parse(text));
      if (parsed.success) proposals.push(parsed.data);
    } catch {
      // unreadable file — skip, the store stays usable
    }
  }
  return proposals;
}

export async function updateProposalStatus(
  root: string,
  id: string,
  status: ProposalStatus,
): Promise<Proposal> {
  const all = await readProposals(root);
  const existing = all.find((p) => p.id === id);
  if (existing === undefined) {
    throw new Error(`no proposal with id "${id}"`);
  }
  if (!canTransition(existing.status, status)) {
    throw new Error(
      `cannot move proposal "${id}" from "${existing.status}" to "${status}"`,
    );
  }
  const updated: Proposal = { ...existing, status };
  await writeProposal(root, updated);
  return updated;
}
