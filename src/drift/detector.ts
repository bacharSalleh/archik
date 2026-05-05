import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Document } from "../domain/types.ts";
import type { IgnoreRule } from "./driftignore.ts";
import { isIgnored } from "./driftignore.ts";
import type { LoadedUseCaseDoc } from "../io/usecase-discovery.ts";

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

export interface MissingTestDrift {
  type: "missing-test";
  ucId: string;
  sliceId: string;
  testPath: string;
  ucFile: string;
}

export interface DriftResult {
  orphan: OrphanDrift[];
  unmapped: UnmappedDrift[];
  missingTests: MissingTestDrift[];
  ignored: IgnoredItem[];
  summary: {
    orphan: number;
    unmapped: number;
    missingTests: number;
    ignored: number;
    total: number;
  };
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
    missingTests: [],
    ignored,
    summary: {
      orphan: orphan.length,
      unmapped: unmapped.length,
      missingTests: 0,
      ignored: ignored.length,
      total: orphan.length + unmapped.length,
    },
  };
}

/** Check that every test path declared in active slices exists on disk. */
export function detectMissingTestPaths(
  ucDocs: LoadedUseCaseDoc[],
  root: string,
): MissingTestDrift[] {
  const missing: MissingTestDrift[] = [];
  for (const { doc, relPath } of ucDocs) {
    for (const slice of doc.slices) {
      if (slice.status === "proposed" || slice.status === "deprecated") continue;
      if (!slice.tests || slice.tests.length === 0) continue;
      for (const t of slice.tests) {
        if (!existsSync(path.resolve(root, t))) {
          missing.push({
            type: "missing-test",
            ucId: doc.id,
            sliceId: slice.id,
            testPath: t,
            ucFile: relPath,
          });
        }
      }
    }
  }
  return missing;
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
