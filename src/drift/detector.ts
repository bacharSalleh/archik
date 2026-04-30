import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Document } from "../domain/types.ts";
import type { IgnoreRule } from "./driftignore.ts";
import { isIgnored } from "./driftignore.ts";

const SOURCE_ROOTS = ["src", "services", "packages", "apps"];

export interface OrphanDrift {
  type: "orphan";
  id: string;
  sourcePath: string;
}

export interface UnmappedDrift {
  type: "unmapped";
  path: string;
}

export interface IgnoredItem {
  type: "ignored";
  path: string;
  pattern: string;
}

export interface DriftResult {
  orphan: OrphanDrift[];
  unmapped: UnmappedDrift[];
  ignored: IgnoredItem[];
  summary: { orphan: number; unmapped: number; ignored: number; total: number };
}

/**
 * Detect drift between an archik document and the source tree.
 * Pure detection logic — no CLI concerns here.
 *
 * @param doc       Parsed archik document (already validated).
 * @param root      Absolute project root path.
 * @param ignoreRules  Parsed .driftignore rules (may be empty).
 */
export async function detectDrift(
  doc: Document,
  root: string,
  ignoreRules: IgnoreRule[],
): Promise<DriftResult> {
  const orphan = detectOrphans(doc, root);
  const { unmapped, ignored } = await detectUnmapped(doc, root, ignoreRules);

  return {
    orphan,
    unmapped,
    ignored,
    summary: {
      orphan: orphan.length,
      unmapped: unmapped.length,
      ignored: ignored.length,
      total: orphan.length + unmapped.length,
    },
  };
}

function detectOrphans(doc: Document, root: string): OrphanDrift[] {
  return doc.nodes
    .filter(
      (n) =>
        n.sourcePath !== undefined &&
        (n.status === undefined || n.status === "active"),
    )
    .filter((n) => !existsSync(path.resolve(root, n.sourcePath!)))
    .map((n) => ({ type: "orphan" as const, id: n.id, sourcePath: n.sourcePath! }));
}

async function detectUnmapped(
  doc: Document,
  root: string,
  ignoreRules: IgnoreRule[],
): Promise<{ unmapped: UnmappedDrift[]; ignored: IgnoredItem[] }> {
  const activePaths = new Set(
    doc.nodes
      .filter(
        (n) =>
          n.sourcePath !== undefined &&
          (n.status === undefined || n.status === "active"),
      )
      .map((n) => normalizeDir(n.sourcePath!)),
  );

  const unmapped: UnmappedDrift[] = [];
  const ignored: IgnoredItem[] = [];

  for (const srcRoot of SOURCE_ROOTS) {
    const absRoot = path.resolve(root, srcRoot);
    if (!existsSync(absRoot)) continue;

    let entries;
    try {
      entries = await readdir(absRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const relDir = `${srcRoot}/${entry.name}/`;

      if (isCovered(relDir, activePaths)) continue;

      const rule = isIgnored(relDir, ignoreRules);
      if (rule) {
        ignored.push({ type: "ignored", path: relDir, pattern: rule.pattern });
      } else {
        unmapped.push({ type: "unmapped", path: relDir });
      }
    }
  }

  return { unmapped, ignored };
}

function normalizeDir(p: string): string {
  return p.endsWith("/") ? p : p + "/";
}

function isCovered(relDir: string, activePaths: Set<string>): boolean {
  // A directory is "covered" if any sourcePath is exactly it or is inside it.
  for (const sp of activePaths) {
    if (sp === relDir || sp.startsWith(relDir)) return true;
  }
  return false;
}
