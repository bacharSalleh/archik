import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EvolutionEvent } from "../domain/evolution/events.ts";
import type { Proposal } from "../domain/evolution/proposal.ts";
import {
  appendEvents,
  appendLearned,
  evolutionDir,
  isEvolutionEnabled,
  readEvents,
  readLearned,
  readProposals,
  setEvolutionEnabled,
  updateProposalStatus,
  writeProposal,
} from "./evolution-log.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "archik-evo-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const event = (over: Partial<EvolutionEvent> = {}): EvolutionEvent => ({
  v: 1,
  ts: "2026-06-10T12:00:00.000Z",
  type: "command",
  command: "validate",
  outcome: "ok",
  exitCode: 0,
  ...over,
});

const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  id: "p-2026-06-10-ab12",
  createdAt: "2026-06-10T12:00:00.000Z",
  status: "pending",
  kind: "skill-note",
  summary: "A summary.",
  evidence: { events: 3, window: "all", samples: [] },
  payload: { note: "A note." },
  ...over,
});

describe("enable / disable", () => {
  it("is disabled by default", async () => {
    expect(await isEvolutionEnabled(root)).toBe(false);
  });

  it("round-trips enable and disable", async () => {
    await setEvolutionEnabled(root, true);
    expect(await isEvolutionEnabled(root)).toBe(true);
    await setEvolutionEnabled(root, false);
    expect(await isEvolutionEnabled(root)).toBe(false);
  });
});

describe("event log", () => {
  it("reads empty when no log exists", async () => {
    expect(await readEvents(root)).toEqual({ events: [], corruptLines: 0 });
  });

  it("appends and reads back events", async () => {
    await appendEvents(root, [event(), event({ command: "drift" })]);
    await appendEvents(root, [event({ command: "q" })]);
    const { events, corruptLines } = await readEvents(root);
    expect(events.map((e) => e.command)).toEqual(["validate", "drift", "q"]);
    expect(corruptLines).toBe(0);
  });

  it("skips and counts corrupt lines", async () => {
    await appendEvents(root, [event()]);
    const logPath = path.join(evolutionDir(root), "events.jsonl");
    await writeFile(logPath, (await readFile(logPath, "utf-8")) + "{oops\n", "utf-8");
    await appendEvents(root, [event({ command: "q" })]);
    const { events, corruptLines } = await readEvents(root);
    expect(events).toHaveLength(2);
    expect(corruptLines).toBe(1);
  });
});

describe("learned overlay", () => {
  it("reads null when absent", async () => {
    expect(await readLearned(root)).toBeNull();
  });

  it("appends notes with a single header", async () => {
    await appendLearned(root, "First note.", "p-1");
    await appendLearned(root, "Second note.", "p-2");
    const text = (await readLearned(root))!;
    expect(text.match(/# Learned/g)).toHaveLength(1);
    expect(text).toContain("First note.");
    expect(text).toContain("Second note.");
    expect(text).toContain("p-2");
  });
});

describe("proposal store", () => {
  it("reads empty when no proposals dir exists", async () => {
    expect(await readProposals(root)).toEqual([]);
  });

  it("writes and reads back proposals", async () => {
    await writeProposal(root, proposal());
    await writeProposal(root, proposal({ id: "p-2026-06-10-cd34" }));
    const all = await readProposals(root);
    expect(all.map((p) => p.id).sort()).toEqual([
      "p-2026-06-10-ab12",
      "p-2026-06-10-cd34",
    ]);
  });

  it("updates a proposal status", async () => {
    await writeProposal(root, proposal());
    const updated = await updateProposalStatus(
      root,
      "p-2026-06-10-ab12",
      "rejected",
    );
    expect(updated.status).toBe("rejected");
    const all = await readProposals(root);
    expect(all[0]!.status).toBe("rejected");
  });

  it("throws on an illegal status transition", async () => {
    await writeProposal(root, proposal({ status: "rejected" }));
    await expect(
      updateProposalStatus(root, "p-2026-06-10-ab12", "approved"),
    ).rejects.toThrow(/rejected/);
  });

  it("throws on an unknown proposal id", async () => {
    await expect(
      updateProposalStatus(root, "p-missing", "approved"),
    ).rejects.toThrow(/p-missing/);
  });

  it("ignores non-proposal files in the directory", async () => {
    await mkdir(path.join(evolutionDir(root), "proposals"), {
      recursive: true,
    });
    await writeFile(
      path.join(evolutionDir(root), "proposals", "notes.txt"),
      "hi",
      "utf-8",
    );
    expect(await readProposals(root)).toEqual([]);
  });
});
