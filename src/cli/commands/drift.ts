import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { detectDrift, type DriftResult } from "../../drift/detector.ts";
import { parseDriftignore } from "../../drift/driftignore.ts";
import { parseYaml } from "../../io/yaml.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { projectRoot, resolveDocPath } from "../resolveDocPath.ts";

const isJson = (opts: ParsedOptions): boolean => {
  const v = getString(opts, "json");
  return v !== undefined && v !== "false" && v !== "0";
};

function emitJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export async function driftCommand(
  opts: ParsedOptions,
): Promise<number> {
  const json = isJson(opts);
  let abs: string;
  try {
    abs = await resolveDocPath(opts._[0]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) emitJson({ orphan: [], unmapped: [], ignored: [], summary: { orphan: 0, unmapped: 0, ignored: 0, total: 0 }, error: message });
    else console.error(`✗ ${message}`);
    return 1;
  }

  let text: string;
  try {
    text = await readFile(abs, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) emitJson({ orphan: [], unmapped: [], ignored: [], summary: { orphan: 0, unmapped: 0, ignored: 0, total: 0 }, error: message });
    else console.error(`✗ Cannot read ${path.relative(process.cwd(), abs)}`);
    return 1;
  }

  let doc;
  try {
    doc = parseYaml(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) emitJson({ orphan: [], unmapped: [], ignored: [], summary: { orphan: 0, unmapped: 0, ignored: 0, total: 0 }, error: message });
    else console.error(`✗ Invalid document: ${message}`);
    return 1;
  }

  const root = projectRoot(abs);

  // Load .driftignore if it exists
  const ignoreFile = getString(opts, "ignore") ?? ".archik/.driftignore";
  const ignoreAbs = path.resolve(root, ignoreFile);
  let ignoreRules: ReturnType<typeof parseDriftignore> = [];
  if (existsSync(ignoreAbs)) {
    const ignoreText = await readFile(ignoreAbs, "utf-8");
    ignoreRules = parseDriftignore(ignoreText);
  }

  const result = await detectDrift(doc, root, ignoreRules);

  if (json) {
    emitJson(toJsonShape(result));
  } else {
    formatHuman(result);
  }

  return result.summary.total > 0 ? 1 : 0;
}

/** Strip internal `type` discriminators for the public JSON API. */
function toJsonShape(result: DriftResult) {
  return {
    orphan: result.orphan.map((o) => ({ id: o.id, sourcePath: o.sourcePath })),
    unmapped: result.unmapped.map((u) => ({ path: u.path })),
    ignored: result.ignored.map((ig) => ({ path: ig.path, pattern: ig.pattern })),
    summary: result.summary,
  };
}

function formatHuman(result: DriftResult): void {
  const { orphan, unmapped, ignored, summary } = result;

  if (orphan.length > 0) {
    console.log(
      `\n${orphan.length} ORPHAN${orphan.length !== 1 ? "S" : ""} — nodes with no matching code`,
    );
    for (const o of orphan) {
      console.log(`  ✗ ${o.id.padEnd(20)} sourcePath ${o.sourcePath} not found`);
    }
  }

  if (unmapped.length > 0) {
    console.log(
      `\n${unmapped.length} UNMAPPED — code with no matching node`,
    );
    for (const u of unmapped) {
      console.log(`  ✗ ${u.path}`);
    }
  }

  if (ignored.length > 0) {
    console.log(
      `\n${ignored.length} IGNORED — matched .driftignore`,
    );
    for (const ig of ignored) {
      console.log(`  ○ ${ig.path.padEnd(36)} (${ig.pattern})`);
    }
  }

  if (summary.total === 0 && ignored.length === 0) {
    console.log(`✓ No drift detected — diagram matches source tree.`);
  } else {
    console.log(
      `\narchik drift: ${summary.total} issue${summary.total !== 1 ? "s" : ""} found` +
        (ignored.length > 0 ? ` (${ignored.length} ignored)` : ""),
    );
  }
}
