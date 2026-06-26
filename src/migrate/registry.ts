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

function hasArchitecture(ws: Workspace): boolean {
  return ws.exists(MAIN) || ws.exists(LEGACY);
}

function hasUseCases(ws: Workspace): boolean {
  return ws.list(".archik/usecases").some((f) => f.endsWith(".archik.uc.yaml"));
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
    title: "Back-fill the use-case / sequence-diagram layer (Claude)",
    applies: (ws) => hasArchitecture(ws) && !hasUseCases(ws),
    run: () => ({
      changed: [],
      needsJudgment: [
        "no use cases / sequence diagrams — run `/archik:migrate` to back-fill them from the model",
      ],
    }),
  },
];
