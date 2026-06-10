import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EvolutionEvent } from "../../domain/evolution/events.ts";
import {
  appendEvents,
  isEvolutionEnabled,
  readLearned,
  readProposals,
  setEvolutionEnabled,
  writeProposal,
} from "../../io/evolution-log.ts";
import type { Proposal } from "../../domain/evolution/proposal.ts";
import { evolutionCommand } from "./evolution.ts";
import type { ParsedOptions } from "../options.ts";

let root: string;
let mainPath: string;

const MAIN_YAML = `version: "1.0"
name: Test
nodes:
  - id: api
    kind: service
    name: API
    description: REST API serving the frontend.
    sourcePath: src
edges: []
constraints:
  - id: services-owned
    description: Every service declares an owner.
    requireOwner:
      kinds: [service]
    except: [api]
`;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "archik-evocli-"));
  await mkdir(path.join(root, ".archik"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  mainPath = path.join(root, ".archik", "main.archik.yaml");
  await writeFile(mainPath, MAIN_YAML, "utf-8");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

const run = (...args: string[]): Promise<number> => {
  const opts: ParsedOptions = { _: args, doc: mainPath };
  return evolutionCommand(opts);
};

const rejectedEvent = (n: number): EvolutionEvent => ({
  v: 1,
  ts: `2026-06-10T12:00:0${n}.000Z`,
  type: "suggest_rejected",
  outcome: "ok",
});

const skillNote = (over: Partial<Proposal> = {}): Proposal => ({
  id: "p-2026-06-10-ab12",
  createdAt: "2026-06-10T12:00:00.000Z",
  status: "pending",
  kind: "skill-note",
  summary: "A summary.",
  evidence: { events: 3, window: "all", samples: [] },
  payload: { note: "Propose smaller diffs." },
  ...over,
});

describe("evolution enable/disable/status", () => {
  it("enable turns observation on", async () => {
    expect(await run("enable")).toBe(0);
    expect(await isEvolutionEnabled(root)).toBe(true);
  });

  it("disable turns observation off", async () => {
    await run("enable");
    expect(await run("disable")).toBe(0);
    expect(await isEvolutionEnabled(root)).toBe(false);
  });

  it("status succeeds even when nothing exists yet", async () => {
    expect(await run("status")).toBe(0);
  });

  it("unknown subcommand exits 2", async () => {
    expect(await run("frobnicate")).toBe(2);
  });
});

describe("evolution reflect", () => {
  it("creates proposals from insight-worthy events", async () => {
    await setEvolutionEnabled(root, true);
    await appendEvents(root, [rejectedEvent(1), rejectedEvent(2), rejectedEvent(3)]);
    expect(await run("reflect")).toBe(0);
    const proposals = await readProposals(root);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!).toMatchObject({ status: "pending", kind: "skill-note" });
  });

  it("is idempotent for the same insight", async () => {
    await setEvolutionEnabled(root, true);
    await appendEvents(root, [rejectedEvent(1), rejectedEvent(2), rejectedEvent(3)]);
    await run("reflect");
    await run("reflect");
    expect(await readProposals(root)).toHaveLength(1);
  });

  it("reports zero insights on a quiet log", async () => {
    await setEvolutionEnabled(root, true);
    expect(await run("reflect")).toBe(0);
    expect(await readProposals(root)).toHaveLength(0);
  });
});

describe("evolution approve / reject", () => {
  it("approve of a skill-note appends to learned.md and marks applied", async () => {
    await writeProposal(root, skillNote());
    expect(await run("approve", "p-2026-06-10-ab12")).toBe(0);
    const learned = await readLearned(root);
    expect(learned).toContain("Propose smaller diffs.");
    const [p] = await readProposals(root);
    expect(p!.status).toBe("applied");
  });

  it("approve of an update-node stages a suggestion sidecar", async () => {
    await writeProposal(
      root,
      skillNote({
        kind: "update-node",
        payload: { nodeId: "api", set: { owner: "team-core" } },
      }),
    );
    expect(await run("approve", "p-2026-06-10-ab12")).toBe(0);
    const sidecar = path.join(root, ".archik", "main.archik.suggested.yaml");
    expect(existsSync(sidecar)).toBe(true);
    const text = await readFile(sidecar, "utf-8");
    expect(text).toContain("team-core");
    const [p] = await readProposals(root);
    expect(p!.status).toBe("approved");
  });

  it("approve of an add-exception stages a sidecar with the new exception", async () => {
    await writeProposal(
      root,
      skillNote({
        kind: "add-exception",
        payload: { constraintId: "services-owned", exceptId: "api2" },
      }),
    );
    expect(await run("approve", "p-2026-06-10-ab12")).toBe(0);
    const text = await readFile(
      path.join(root, ".archik", "main.archik.suggested.yaml"),
      "utf-8",
    );
    expect(text).toContain("api2");
  });

  it("approve refuses when a sidecar already exists", async () => {
    await writeFile(
      path.join(root, ".archik", "main.archik.suggested.yaml"),
      MAIN_YAML,
      "utf-8",
    );
    await writeProposal(
      root,
      skillNote({
        kind: "update-node",
        payload: { nodeId: "api", set: { owner: "team-core" } },
      }),
    );
    expect(await run("approve", "p-2026-06-10-ab12")).toBe(1);
  });

  it("approve of an unknown id exits 2", async () => {
    expect(await run("approve", "p-missing")).toBe(2);
  });

  it("approve of an unknown node id fails validation", async () => {
    await writeProposal(
      root,
      skillNote({
        kind: "update-node",
        payload: { nodeId: "ghost", set: { owner: "team-core" } },
      }),
    );
    expect(await run("approve", "p-2026-06-10-ab12")).toBe(1);
  });

  it("reject marks the proposal rejected", async () => {
    await writeProposal(root, skillNote());
    expect(await run("reject", "p-2026-06-10-ab12")).toBe(0);
    const [p] = await readProposals(root);
    expect(p!.status).toBe("rejected");
  });
});

describe("evolution propose (agent-authored)", () => {
  it("stores a valid draft as a pending proposal", async () => {
    const draft = path.join(root, "draft.yaml");
    await writeFile(
      draft,
      `kind: skill-note\nsummary: Agent found a gap.\npayload:\n  note: Always run trace after usecase edits.\n`,
      "utf-8",
    );
    expect(await run("propose", draft)).toBe(0);
    const [p] = await readProposals(root);
    expect(p!).toMatchObject({ status: "pending", kind: "skill-note" });
  });

  it("rejects an invalid draft", async () => {
    const draft = path.join(root, "draft.yaml");
    await writeFile(draft, `kind: nope\nsummary: x\n`, "utf-8");
    expect(await run("propose", draft)).toBe(1);
    expect(await readProposals(root)).toHaveLength(0);
  });
});

describe("evolution report / proposals", () => {
  it("report exits 0 with json output", async () => {
    await setEvolutionEnabled(root, true);
    await appendEvents(root, [rejectedEvent(1)]);
    const opts: ParsedOptions = { _: ["report"], doc: mainPath, json: "true" };
    expect(await evolutionCommand(opts)).toBe(0);
  });

  it("proposals lists what exists", async () => {
    await writeProposal(root, skillNote());
    expect(await run("proposals")).toBe(0);
  });
});
