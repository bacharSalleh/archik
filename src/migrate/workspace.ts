import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export type Workspace = {
  root: string;
  exists(rel: string): boolean;
  read(rel: string): string;
  write(rel: string, text: string): void;
  move(fromRel: string, toRel: string): void;
  remove(rel: string): void;
  list(dirRel: string): string[];
};

export function createWorkspace(root: string): Workspace {
  const abs = (rel: string): string => path.join(root, rel);
  const ensureDir = (filePath: string): void => {
    mkdirSync(path.dirname(filePath), { recursive: true });
  };
  return {
    root,
    exists: (rel) => existsSync(abs(rel)),
    read: (rel) => readFileSync(abs(rel), "utf-8"),
    write: (rel, text) => {
      const p = abs(rel);
      ensureDir(p);
      writeFileSync(p, text, "utf-8");
    },
    move: (fromRel, toRel) => {
      const to = abs(toRel);
      ensureDir(to);
      renameSync(abs(fromRel), to);
    },
    remove: (rel) => rmSync(abs(rel), { recursive: true, force: true }),
    list: (dirRel) => {
      const p = abs(dirRel);
      return existsSync(p) ? readdirSync(p) : [];
    },
  };
}
