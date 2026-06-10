/**
 * `archik import compose [file]` — bootstrap an archik document from
 * docker-compose, so adoption on an existing containerised project
 * starts from a mostly-correct diagram instead of a blank canvas.
 *
 * Output: the generated YAML on stdout by default (pipe it, review
 * it, hand it to `suggest set`); `--out <file>` writes it (refusing
 * to overwrite without --force). The result is schema-validated
 * before anything is emitted.
 */
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { importCompose } from "../../domain/compose-import.ts";
import { formatErrors, validateDocument } from "../../domain/validate.ts";
import { stringifyYaml } from "../../io/yaml.ts";
import { cross, dim, tick, yellow } from "../colors.ts";
import { getString, type ParsedOptions } from "../options.ts";

const DEFAULT_COMPOSE_FILES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
];

export async function importCommand(opts: ParsedOptions): Promise<number> {
  const sub = opts._[0];
  if (sub !== "compose") {
    console.error(
      `${cross()} Usage: archik import compose [file] [--out <file>] [--force] [--name <n>]`,
    );
    return 2;
  }

  const cwd = process.cwd();
  let composePath = opts._[1];
  if (composePath === undefined) {
    composePath = DEFAULT_COMPOSE_FILES.find((f) =>
      existsSync(path.resolve(cwd, f)),
    );
    if (composePath === undefined) {
      console.error(
        `${cross()} no compose file found (looked for ${DEFAULT_COMPOSE_FILES.join(", ")})`,
      );
      return 1;
    }
  }
  const composeAbs = path.resolve(cwd, composePath);

  let raw: unknown;
  try {
    raw = YAML.parse(await readFile(composeAbs, "utf-8"));
  } catch (err) {
    console.error(
      `${cross()} ${composePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }

  const projectName =
    getString(opts, "name") ?? path.basename(cwd) ?? "Imported architecture";
  const existsDir = (rel: string): boolean => {
    try {
      return statSync(path.resolve(cwd, rel)).isDirectory();
    } catch {
      return false;
    }
  };

  const { doc, issues } = importCompose(raw, projectName, existsDir);
  if (doc.nodes.length === 0) {
    console.error(`${cross()} ${composePath}: no services found`);
    return 1;
  }

  const validated = validateDocument(doc);
  if (!validated.ok) {
    console.error(`${cross()} generated document failed validation (please report this):`);
    console.error(formatErrors(validated.errors));
    return 1;
  }

  for (const issue of issues) {
    console.error(`${yellow("warn:")} ${issue.service}: ${issue.message}`);
  }

  const yaml = stringifyYaml(doc);
  const out = getString(opts, "out");
  if (out === undefined) {
    console.log(yaml);
    console.error(
      dim(
        `# ${doc.nodes.length} nodes, ${doc.edges.length} edges from ${composePath} — review, then save as .archik/main.archik.yaml or stage via \`archik suggest set\``,
      ),
    );
    return 0;
  }

  const outAbs = path.resolve(cwd, out);
  const force = getString(opts, "force") !== undefined;
  if (existsSync(outAbs) && !force) {
    console.error(
      `${cross()} ${out} already exists — pass --force to overwrite, or stage the import as a suggestion instead:`,
    );
    console.error(`  archik import compose ${composePath} | archik suggest set --note "import from compose" -`);
    return 1;
  }
  await mkdir(path.dirname(outAbs), { recursive: true });
  await writeFile(outAbs, yaml, "utf-8");
  console.log(
    `${tick()} ${out} — ${doc.nodes.length} nodes, ${doc.edges.length} edges from ${composePath}`,
  );
  console.log(
    dim(
      `  next: refine the imported descriptions, then \`archik validate\` and \`archik dev\``,
    ),
  );
  return 0;
}
