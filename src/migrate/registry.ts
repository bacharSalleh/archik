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

/** Artifact files of the features removed in 0.20. */
const RETIRED_FILE = /\.archik\.(uc|seq|actors|alphas)\.yaml$|\.archik\.trace\.json$/;
const RETIRED_DIR = ".archik/retired";

/** Every file under `dir` (relative paths), depth-limited. */
function walkFiles(
  ws: Workspace,
  dir: string,
  skip: (name: string, rel: string) => boolean,
  depth = 0,
  out: string[] = [],
): string[] {
  if (depth > 12 || out.length > 5000) return out;
  for (const name of ws.list(dir)) {
    const rel = dir === "" ? name : `${dir}/${name}`;
    if (skip(name, rel)) continue;
    if (ws.isDir(rel)) walkFiles(ws, rel, skip, depth + 1, out);
    else out.push(rel);
  }
  return out;
}

function retiredArtifacts(ws: Workspace): string[] {
  return walkFiles(ws, ".archik", (_name, rel) => rel === RETIRED_DIR).filter((f) =>
    RETIRED_FILE.test(f),
  );
}

function sidecars(ws: Workspace): string[] {
  const found = walkFiles(ws, ".archik", (_name, rel) => rel === RETIRED_DIR).filter((f) =>
    f.endsWith(".archik.suggested.yaml"),
  );
  if (ws.exists("architecture.archik.suggested.yaml")) found.push("architecture.archik.suggested.yaml");
  return found;
}

function sidecarHasDecision(text: string): boolean {
  const doc = parseDocument(text);
  return doc.getIn(["metadata", "suggestion", "decision"]) !== undefined;
}

const CODE_FILE = /\.(m?[jt]sx?|cjs|cts)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", "coverage", "vendor", "target"]);

/** Places outside the model that still use a removed feature. */
function retiredReferences(ws: Workspace): string[] {
  const notes: string[] = [];
  const skip = (name: string): boolean => name.startsWith(".") || SKIP_DIRS.has(name);
  const importers = walkFiles(ws, "", skip)
    .filter((f) => CODE_FILE.test(f))
    .filter((f) => /["']archik\/trace["']/.test(ws.read(f)));
  if (importers.length > 0) {
    notes.push(
      `code imports the removed \`archik/trace\` recorder — remove the trace() calls: ${importers.slice(0, 10).join(", ")}${importers.length > 10 ? ", …" : ""}`,
    );
  }
  const workflows = [".github/workflows"]
    .flatMap((d) => ws.list(d).map((n) => `${d}/${n}`))
    .filter((f) => /\.ya?ml$/.test(f) && /trace-fail-on/.test(ws.read(f)));
  if (workflows.length > 0) {
    notes.push(
      `GitHub workflow uses the removed \`trace-fail-on\` input — replace it with \`smells-fail: true\` (or drop it): ${workflows.join(", ")}`,
    );
  }
  if (ws.exists("package.json") && /archik (trace|alpha)\b|archik render --seq/.test(ws.read("package.json"))) {
    notes.push("package.json scripts call a removed command (`archik trace`, `archik alpha` or `render --seq`) — remove or replace them");
  }
  return notes;
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
  {
    id: 4,
    title: "Retire use-case / sequence / actor / alpha / trace artifacts",
    applies: (ws) =>
      retiredArtifacts(ws).length > 0 ||
      sidecars(ws).some((f) => {
        const text = ws.read(f);
        return stripRetiredKeys(text) !== null || !sidecarHasDecision(text);
      }) ||
      retiredReferences(ws).length > 0,
    run: (ws) => {
      const changed: string[] = [];
      const needsJudgment: string[] = [];

      // 1. Move retired artifacts out of the way, keeping their layout.
      const moved = retiredArtifacts(ws);
      for (const f of moved) {
        const to = `${RETIRED_DIR}/${f.slice(".archik/".length)}`;
        ws.move(f, to);
        changed.push(to);
      }
      // Drop folders the move emptied (e.g. .archik/usecases/), deepest first.
      const dirs = [...new Set(moved.map((f) => f.slice(0, f.lastIndexOf("/"))))]
        .filter((d) => d !== ".archik")
        .sort((x, y) => y.length - x.length);
      for (const d of dirs) {
        if (ws.isDir(d) && ws.list(d).length === 0) ws.remove(d);
      }
      if (moved.length > 0) {
        needsJudgment.push(
          `moved ${moved.length} retired file(s) (use cases, sequences, actors, alphas, traces) to ${RETIRED_DIR}/ — archik no longer reads them; keep them as history or delete them`,
        );
      }

      // 2. Pending suggestions: strip retired keys; flag a missing decision record.
      for (const f of sidecars(ws)) {
        const next = stripRetiredKeys(ws.read(f));
        if (next !== null) {
          ws.write(f, next);
          changed.push(f);
        }
        if (!sidecarHasDecision(ws.read(f))) {
          needsJudgment.push(
            `pending suggestion ${f} has no decision record, so accept will refuse it — re-stage it with /archik:suggest (add metadata.suggestion.decision) or reject it`,
          );
        }
      }

      // 3. Code, CI and scripts that still use removed features.
      needsJudgment.push(...retiredReferences(ws));
      return { changed, needsJudgment };
    },
  },
];
