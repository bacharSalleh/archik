/**
 * `archik merge-driver` — a git merge driver that understands the
 * document, so two branches editing the same archik YAML stop
 * conflicting on adjacent lines. Nodes and edges are id-keyed; the
 * semantic three-way merge lives in `domain/merge.ts`.
 *
 * Git invokes the driver as:  archik merge-driver %O %A %B
 *   %O  ancestor version    %A  ours (result is written here)    %B  theirs
 *
 * Exit semantics follow git's contract: 0 = clean merge, non-zero =
 * conflict (git marks the path conflicted and the user resolves).
 * On conflict the merged result IS still written to %A — with `ours`
 * preferred on the conflicting fields — and every conflict is printed
 * to stderr so the user knows exactly what to look at. On a hard
 * error (unparseable side) nothing is written and git falls back to
 * the usual manual resolution.
 *
 * `archik merge-driver --install` wires everything up:
 *   - git config merge.archik.name / merge.archik.driver
 *   - `*.archik.yaml merge=archik` in the toplevel .gitattributes
 */
import { existsSync } from "node:fs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { mergeDocuments } from "../../domain/merge.ts";
import { validateDocument } from "../../domain/validate.ts";
import { parseYaml, stringifyYaml } from "../../io/yaml.ts";
import type { Document } from "../../domain/types.ts";
import { cross, dim, tick, yellow } from "../colors.ts";
import { runGit, gitToplevel } from "../git.ts";
import { getString, type ParsedOptions } from "../options.ts";

const ATTR_LINE = "*.archik.yaml merge=archik";
const DRIVER_CMD = "npx archik merge-driver %O %A %B";

export async function mergeDriverCommand(
  opts: ParsedOptions,
): Promise<number> {
  if (getString(opts, "install") !== undefined) {
    return install();
  }

  const [basePath, oursPath, theirsPath] = opts._;
  if (
    basePath === undefined ||
    oursPath === undefined ||
    theirsPath === undefined
  ) {
    console.error(
      `${cross()} Usage: archik merge-driver <base> <ours> <theirs>\n` +
        `       archik merge-driver --install\n` +
        `  Configured by git as: ${DRIVER_CMD}`,
    );
    return 2;
  }

  const sides: Array<{ label: string; file: string }> = [
    { label: "base", file: basePath },
    { label: "ours", file: oursPath },
    { label: "theirs", file: theirsPath },
  ];
  const docs: Document[] = [];
  for (const { label, file } of sides) {
    let text: string;
    try {
      text = await readFile(path.resolve(file), "utf-8");
    } catch (err) {
      console.error(
        `${cross()} cannot read ${label} (${file}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return 2;
    }
    // An empty side happens when the file didn't exist at the
    // ancestor (both branches created it). Treat as an empty doc.
    if (text.trim() === "") {
      docs.push({ version: "1.0", name: "empty", nodes: [], edges: [] });
      continue;
    }
    try {
      docs.push(parseYaml(text));
    } catch (err) {
      console.error(
        `${cross()} ${label} (${file}) is not a valid archik document — falling back to manual merge\n` +
          `  ${err instanceof Error ? err.message : String(err)}`,
      );
      return 2;
    }
  }

  const [base, ours, theirs] = docs as [Document, Document, Document];
  const { doc: merged, conflicts } = mergeDocuments(base, ours, theirs);

  // The merge can be entity-clean yet produce an invalid document —
  // e.g. theirs added an edge to a node ours deleted. Surface those
  // as conflicts too: the human has to pick.
  const validated = validateDocument(merged);
  const semanticErrors = validated.ok ? [] : validated.errors;

  await writeFile(path.resolve(oursPath), stringifyYaml(merged), "utf-8");

  if (conflicts.length === 0 && semanticErrors.length === 0) {
    return 0;
  }
  for (const c of conflicts) {
    console.error(
      `${yellow("conflict:")} ${c.entity} "${c.id}" ${c.field}\n` +
        `  ours:   ${JSON.stringify(c.ours)}\n` +
        `  theirs: ${JSON.stringify(c.theirs)}`,
    );
  }
  for (const e of semanticErrors) {
    console.error(`${yellow("conflict:")} merged document invalid — ${e.path}: ${e.message}`);
  }
  console.error(
    `${dim(`merged result written with "ours" preferred on ${conflicts.length} conflicting field(s); resolve and \`git add\` the file`)}`,
  );
  return 1;
}

async function install(): Promise<number> {
  const cwd = process.cwd();
  const top = gitToplevel(cwd);
  if (!top.ok) {
    console.error(`${cross()} not inside a git repository: ${top.error}`);
    return 1;
  }

  const name = runGit(
    ["config", "merge.archik.name", "archik semantic merge"],
    cwd,
  );
  const driver = runGit(["config", "merge.archik.driver", DRIVER_CMD], cwd);
  if (!name.ok || !driver.ok) {
    console.error(
      `${cross()} git config failed: ${!name.ok ? name.error : !driver.ok ? driver.error : ""}`,
    );
    return 1;
  }

  const attributesPath = path.join(top.out, ".gitattributes");
  let hasLine = false;
  if (existsSync(attributesPath)) {
    const current = await readFile(attributesPath, "utf-8");
    hasLine = current
      .split("\n")
      .some((l) => l.trim() === ATTR_LINE);
    if (!hasLine) {
      const sep = current.endsWith("\n") || current === "" ? "" : "\n";
      await appendFile(attributesPath, `${sep}${ATTR_LINE}\n`, "utf-8");
    }
  } else {
    await writeFile(attributesPath, `${ATTR_LINE}\n`, "utf-8");
  }

  console.log(`${tick()} merge driver installed`);
  console.log(`  git config merge.archik.driver "${DRIVER_CMD}"`);
  console.log(
    `  .gitattributes: ${ATTR_LINE}${hasLine ? dim("  (already present)") : ""}`,
  );
  console.log(
    dim(
      `  note: git config is per-clone — teammates run \`npx archik merge-driver --install\` once too`,
    ),
  );
  return 0;
}
