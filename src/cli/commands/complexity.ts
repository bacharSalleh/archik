/**
 * `archik complexity` — advisory report of over-complex spots in the
 * model, each with a concrete decomposition suggestion. Never fails a
 * build unless `--fail-on-warn` is passed (for CI / hooks).
 */
import { discoverDocs } from "../../io/discovery.ts";
import {
  analyzeComplexity,
  DEFAULT_LIMITS,
  type ComplexityLimits,
  type Finding,
} from "../../domain/complexity.ts";
import { bold, cross, dim, tick, yellow } from "../colors.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { projectRoot, resolveDocPath } from "../resolveDocPath.ts";

const isJson = (opts: ParsedOptions): boolean => {
  const v = getString(opts, "json");
  return v !== undefined && v !== "false" && v !== "0";
};

function intOpt(opts: ParsedOptions, name: string, fallback: number): number {
  const raw = getString(opts, name);
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function limitsFromOpts(opts: ParsedOptions): ComplexityLimits {
  return {
    maxNodes: intOpt(opts, "max-nodes", DEFAULT_LIMITS.maxNodes),
    maxEdges: intOpt(opts, "max-edges", DEFAULT_LIMITS.maxEdges),
    maxChildren: intOpt(opts, "max-children", DEFAULT_LIMITS.maxChildren),
    maxDegree: intOpt(opts, "max-degree", DEFAULT_LIMITS.maxDegree),
    maxDepth: intOpt(opts, "max-depth", DEFAULT_LIMITS.maxDepth),
  };
}

const KIND_LABEL: Record<Finding["kind"], string> = {
  "file-nodes": "file too large (nodes)",
  "file-edges": "file too large (edges)",
  "container-children": "container too large",
  "node-degree": "hub node",
  "nesting-depth": "nesting too deep",
};

export async function complexityCommand(opts: ParsedOptions): Promise<number> {
  const json = isJson(opts);
  let abs: string;
  try {
    abs = await resolveDocPath(opts._[0]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    else console.error(`${cross()} ${message}`);
    return 2;
  }
  const root = projectRoot(abs);
  const discovery = await discoverDocs(abs, root);
  const rootError = discovery.errors.find((e) => e.abs === abs);
  if (rootError !== undefined) {
    if (json) console.log(JSON.stringify({ ok: false, error: rootError.message }, null, 2));
    else console.error(`${cross()} ${rootError.relPath}: ${rootError.message}`);
    return 2;
  }

  const limits = limitsFromOpts(opts);
  const findings = analyzeComplexity(discovery.docs, limits);

  if (json) {
    console.log(JSON.stringify({ ok: true, findings }, null, 2));
  } else if (findings.length === 0) {
    console.log(`${tick()} no complexity hints`);
  } else {
    for (const f of findings) {
      console.log(`${yellow("•")} ${bold(KIND_LABEL[f.kind])}  ${dim(`(${f.value} > ${f.limit})`)}`);
      console.log(`  ${f.suggestion}`);
    }
    console.log(
      dim(`\n${findings.length} hint${findings.length === 1 ? "" : "s"} — these are advisory; decompose to clear them.`),
    );
  }

  const failOnWarn = getString(opts, "fail-on-warn") === "true";
  return failOnWarn && findings.length > 0 ? 1 : 0;
}
