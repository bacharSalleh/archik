import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import {
  checkArchNodeSeqFilePaths,
  checkCrossFileReferences,
  checkSourcePaths,
  formatErrors,
  validateDocument,
  type ValidationError,
} from "../../domain/validate.ts";
import { discoverDocs } from "../../io/discovery.ts";
import { discoverSeqDocs } from "../../io/seq-discovery.ts";
import { checkSeqNodeRefs } from "../../domain/seq-validate.ts";
import { archikFileMode } from "../../domain/suggestion.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { projectRoot, resolveDocPath } from "../resolveDocPath.ts";

const isJson = (opts: ParsedOptions): boolean => {
  const v = getString(opts, "json");
  return v !== undefined && v !== "false" && v !== "0";
};

function emitJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export async function validateCommand(
  opts: ParsedOptions,
): Promise<number> {
  const json = isJson(opts);
  let abs: string;
  try {
    abs = await resolveDocPath(opts._[0]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) emitJson({ ok: false, errors: [{ path: "<root>", message }] });
    else console.error(`✗ ${message}`);
    return 1;
  }
  const file = path.relative(process.cwd(), abs) || abs;

  let text: string;
  try {
    text = await readFile(abs, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      emitJson({ ok: false, file, errors: [{ path: "<root>", message }] });
    } else {
      console.error(`✗ Cannot read ${file}`);
      console.error(message);
    }
    return 1;
  }

  // Run YAML.parse + validateDocument directly so we can surface
  // structured ValidationError[] to JSON callers instead of a single
  // pre-formatted string blob.
  let raw: unknown;
  try {
    raw = YAML.parse(text);
  } catch (err) {
    const message = `Invalid YAML: ${err instanceof Error ? err.message : String(err)}`;
    const errors: ValidationError[] = [{ path: "<root>", message }];
    if (json) emitJson({ ok: false, file, errors });
    else {
      console.error(`✗ ${file}`);
      console.error(formatErrors(errors));
    }
    return 1;
  }

  const validated = validateDocument(raw);
  if (!validated.ok) {
    if (json) emitJson({ ok: false, file, errors: validated.errors });
    else {
      console.error(`✗ ${file}`);
      console.error(formatErrors(validated.errors));
    }
    return 1;
  }

  // Cross-file references — same project root the dev server uses.
  const root = projectRoot(abs);
  const fileExists = (rel: string): boolean =>
    existsSync(path.resolve(root, rel));
  const crossFileErrors = checkCrossFileReferences(validated.value, fileExists);
  if (crossFileErrors.length > 0) {
    if (json) emitJson({ ok: false, file, errors: crossFileErrors });
    else {
      console.error(`✗ ${file}`);
      console.error(formatErrors(crossFileErrors));
    }
    return 1;
  }

  // sourcePath presence + on-disk existence. Strictness depends on the
  // file mode (normal/suggested = strict, discussion = relaxed).
  const mode = archikFileMode(abs);
  const sourcePathErrors = checkSourcePaths(validated.value, mode, fileExists);
  if (sourcePathErrors.length > 0) {
    if (json) emitJson({ ok: false, file, errors: sourcePathErrors });
    else {
      console.error(`✗ ${file}`);
      console.error(formatErrors(sourcePathErrors));
    }
    return 1;
  }

  // Walk all sub-architecture files linked from the root. discoverDocs
  // already parses + schema-validates each one; errors[] captures any
  // that fail so we surface them here rather than silently ignoring them.
  const discovery = await discoverDocs(abs, root);
  if (discovery.errors.length > 0) {
    if (json) {
      emitJson({ ok: false, file, errors: discovery.errors.map((e) => ({ path: e.relPath, message: e.message })) });
    } else {
      for (const e of discovery.errors) console.error(`✗ ${e.relPath}: ${e.message}`);
    }
    return 1;
  }

  // Validate .archik.seq.yaml files
  const allNodeIds = new Set(discovery.docs.flatMap((d) => d.doc.nodes.map((n) => n.id)));

  // Check seqFiles paths on architecture nodes
  const seqFilePathErrors: ValidationError[] = [];
  for (const { doc: archDoc } of discovery.docs) {
    seqFilePathErrors.push(...checkArchNodeSeqFilePaths(archDoc, fileExists));
  }
  if (seqFilePathErrors.length > 0) {
    if (json) {
      emitJson({ ok: false, file, errors: seqFilePathErrors });
    } else {
      console.error(`✗ seqFiles path errors:`);
      for (const e of seqFilePathErrors) console.error(`  ✗ ${e.path}: ${e.message}`);
    }
    return 1;
  }

  const seqDiscovery = await discoverSeqDocs(root);
  let seqErrorCount = 0;
  for (const e of seqDiscovery.errors) {
    if (!json) console.error(`✗ ${e.relPath}: ${e.message}`);
    seqErrorCount++;
  }
  for (const { relPath, doc: seqDoc } of seqDiscovery.docs) {
    const refErrors = checkSeqNodeRefs(seqDoc, allNodeIds);
    if (refErrors.length > 0) {
      if (!json) {
        console.error(`✗ ${relPath}`);
        for (const e of refErrors) console.error(`  ✗ ${e.path}: ${e.message}`);
      }
      seqErrorCount += refErrors.length;
    }
  }
  if (seqErrorCount > 0) {
    if (json) emitJson({ ok: false, file, errors: [{ path: "<seq>", message: `${seqErrorCount} sequence diagram error(s)` }] });
    return 1;
  }

  if (json) {
    emitJson({
      ok: true,
      file,
      nodes: validated.value.nodes.length,
      edges: validated.value.edges.length,
    });
  } else {
    const totalNodes = discovery.docs.reduce(
      (acc, d) => acc + d.doc.nodes.length,
      0,
    );
    const totalEdges = discovery.docs.reduce(
      (acc, d) => acc + d.doc.edges.length,
      0,
    );
    const fileCount = discovery.docs.length;
    const suffix = fileCount > 1 ? ` (${fileCount} files)` : "";
    console.log(
      `✓ ${file}${suffix} — ${totalNodes} nodes, ${totalEdges} edges`,
    );
  }
  return 0;
}
