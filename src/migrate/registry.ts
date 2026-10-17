import { isMap, isSeq, parseDocument } from "yaml";
import type { Workspace } from "./workspace.ts";

export type MigrationResult = { changed: string[]; needsJudgment: string[] };

export type Migration = {
  id: number;
  title: string;
  applies(ws: Workspace): boolean;
  run(ws: Workspace): MigrationResult;
};

const LEGACY = "architecture.archik.yaml";
const MAIN = ".archik/main.archik.yaml";

/** Node keys dropped when archik stopped modelling use cases, ECB
 *  stereotypes and sequence diagrams. */
const RETIRED_NODE_KEYS = ["stereotype", "seqFiles"] as const;

function archikYamlFiles(ws: Workspace, dir: string): string[] {
  const out: string[] = [];
  for (const name of ws.list(dir)) {
    const rel = `${dir}/${name}`;
    if (name.endsWith(".archik.yaml")) out.push(rel);
    else if (!name.includes(".")) out.push(...archikYamlFiles(ws, rel));
  }
  return out;
}

function modelFiles(ws: Workspace): string[] {
  const files = archikYamlFiles(ws, ".archik");
  if (ws.exists(LEGACY)) files.push(LEGACY);
  return files;
}

/** Strip retired node keys in place. Returns the new text, or null
 *  when nothing changed. Comments and formatting survive. */
function stripRetiredKeys(text: string): string | null {
  const doc = parseDocument(text);
  const nodes = doc.get("nodes");
  if (!isSeq(nodes)) return null;
  let changed = false;
  for (const node of nodes.items) {
    if (!isMap(node)) continue;
    for (const key of RETIRED_NODE_KEYS) {
      if (node.has(key)) {
        node.delete(key);
        changed = true;
      }
    }
  }
  return changed ? doc.toString({ lineWidth: 0 }) : null;
}

/** Ordered, append-only. Never reuse an id; never reorder. */
export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    title: "Move legacy root architecture.archik.yaml into .archik/main.archik.yaml",
    applies: (ws) => ws.exists(LEGACY) && !ws.exists(MAIN),
    run: (ws) => {
      ws.move(LEGACY, MAIN);
      return { changed: [MAIN], needsJudgment: [] };
    },
  },
  {
    id: 2,
    // Retired: archik no longer models use cases or sequence diagrams.
    title: "Back-fill the use-case / sequence-diagram layer (retired)",
    applies: () => false,
    run: () => ({ changed: [], needsJudgment: [] }),
  },
  {
    id: 3,
    title: "Remove retired node fields (stereotype, seqFiles)",
    applies: (ws) => modelFiles(ws).some((f) => stripRetiredKeys(ws.read(f)) !== null),
    run: (ws) => {
      const changed: string[] = [];
      for (const f of modelFiles(ws)) {
        const next = stripRetiredKeys(ws.read(f));
        if (next === null) continue;
        ws.write(f, next);
        changed.push(f);
      }
      return { changed, needsJudgment: [] };
    },
  },
];
