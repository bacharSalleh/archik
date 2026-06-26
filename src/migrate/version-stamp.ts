import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type Stamp = { archikVersion: string; migrationLevel: number };

function stampPath(root: string): string {
  return path.join(root, ".archik", ".version");
}

/** Read `.archik/.version`. Absent or unparseable → migrationLevel 0. */
export function readStamp(root: string): Stamp {
  const file = stampPath(root);
  if (!existsSync(file)) return { archikVersion: "unknown", migrationLevel: 0 };
  try {
    const raw = JSON.parse(readFileSync(file, "utf-8")) as Partial<Stamp>;
    return {
      archikVersion: typeof raw.archikVersion === "string" ? raw.archikVersion : "unknown",
      migrationLevel: Number.isInteger(raw.migrationLevel) ? (raw.migrationLevel as number) : 0,
    };
  } catch {
    return { archikVersion: "unknown", migrationLevel: 0 };
  }
}

export function writeStamp(root: string, stamp: Stamp): void {
  mkdirSync(path.join(root, ".archik"), { recursive: true });
  writeFileSync(stampPath(root), JSON.stringify(stamp, null, 2) + "\n", "utf-8");
}
