/**
 * `archik style [--json]`       — the project's architecture style: its
 *                                 rule, layers / modules, what sits where,
 *                                 violations and hints.
 * `archik style list [--json]`  — every supported style, with the YAML
 *                                 to adopt it.
 *
 * The style itself is changed like any model change: through a
 * `suggest set` draft that sets `style:` (and node `layer:` fields).
 */
import { discoverDocs } from "../../io/discovery.ts";
import {
  checkStyle,
  effectiveLayers,
  STYLE_KINDS,
  styleInfo,
  styleLayers,
  type Style,
} from "../../domain/style.ts";
import type { Node } from "../../domain/types.ts";
import { bold, cross, cyan, dim, tick, yellow } from "../colors.ts";
import { getString, type ParsedOptions } from "../options.ts";
import { projectRoot, resolveDocPath } from "../resolveDocPath.ts";

const isJson = (opts: ParsedOptions): boolean => {
  const v = getString(opts, "json");
  return v !== undefined && v !== "false" && v !== "0";
};

function snippet(kind: (typeof STYLE_KINDS)[number]): string {
  const info = styleInfo(kind);
  if (info.layers.length > 0) {
    return `style:\n  kind: ${kind}\n# then give top-level nodes a layer (children inherit it):\n#   layer: ${info.layers[0]}   # one of: ${info.layers.join(", ")}`;
  }
  return `style:\n  kind: ${kind}\n  shared: [<module-id>]   # optional: modules every module may use`;
}

export async function styleCommand(opts: ParsedOptions): Promise<number> {
  const json = isJson(opts);
  if (opts._[0] === "list") {
    const all = STYLE_KINDS.map((kind) => ({ kind, ...styleInfo(kind), yaml: snippet(kind) }));
    if (json) {
      console.log(JSON.stringify({ ok: true, styles: all }, null, 2));
      return 0;
    }
    for (const s of all) {
      console.log(`${bold(s.kind)} — ${s.title}`);
      console.log(`  ${s.summary}`);
      console.log(`  ${dim("rule:")} ${s.rule}`);
      if (s.layers.length > 0) console.log(`  ${dim("layers:")} ${s.layers.join(" → ")}`);
      console.log("");
    }
    console.log(dim("Adopt one through a suggestion that sets `style:` in the root file (see `archik style list --json` for the YAML)."));
    return 0;
  }

  let abs: string;
  try {
    abs = await resolveDocPath(opts._[0] ?? getString(opts, "doc"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    else console.error(`${cross()} ${message}`);
    return 2;
  }
  const discovery = await discoverDocs(abs, projectRoot(abs));
  const check = checkStyle(discovery.docs);
  const nodes = discovery.docs.flatMap((d) => d.doc.nodes);

  if (check.style === null) {
    if (json) console.log(JSON.stringify({ ok: true, style: null }, null, 2));
    else {
      console.log("No architecture style declared.");
      console.log(dim("See the options: archik style list"));
    }
    return 0;
  }

  const placement = placementOf(check.style, nodes);
  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: check.errors.length === 0,
          style: check.style,
          info: styleInfo(check.style.kind),
          placement,
          violations: check.errors,
          hints: check.hints,
        },
        null,
        2,
      ),
    );
    return check.errors.length === 0 ? 0 : 1;
  }

  const info = styleInfo(check.style.kind);
  console.log(`${bold(info.title)} ${dim(`(${check.style.kind})`)}`);
  console.log(`  ${info.summary}`);
  console.log(`  ${bold("rule:")} ${info.rule}`);
  console.log("");
  for (const group of placement) {
    console.log(`  ${cyan(group.name.padEnd(20))} ${group.nodes.length > 0 ? group.nodes.join(", ") : dim("(empty)")}`);
  }
  console.log("");
  if (check.errors.length === 0) {
    console.log(`${tick()} the model follows the ${check.style.kind} style`);
  } else {
    console.log(`${cross()} ${check.errors.length} violation${check.errors.length === 1 ? "" : "s"}:`);
    for (const e of check.errors) console.log(`  • ${e.message}`);
  }
  for (const h of check.hints) console.log(`${yellow("ⓘ")} ${h}`);
  return check.errors.length === 0 ? 0 : 1;
}

/** Top-level nodes grouped by layer (layered kinds) or listed as modules. */
function placementOf(style: Style, nodes: Node[]): Array<{ name: string; nodes: string[] }> {
  const layers = styleLayers(style);
  if (layers.length > 0) {
    const layerOf = effectiveLayers(nodes);
    // Show the nodes that set a layer themselves — their children follow.
    const groups = layers.map((name) => ({
      name,
      nodes: nodes.filter((n) => n.layer === name).map((n) => n.id),
    }));
    const none = nodes.filter((n) => n.kind !== "external" && !layerOf.has(n.id) && n.parentId === undefined);
    if (none.length > 0) groups.push({ name: "(no layer)", nodes: none.map((n) => n.id) });
    return groups;
  }
  const shared = new Set(style.shared ?? []);
  return nodes
    .filter((n) => n.parentId === undefined && n.kind !== "external")
    .map((m) => ({
      name: shared.has(m.id) ? `${m.id} (shared)` : m.id,
      nodes: nodes.filter((n) => n.parentId === m.id).map((n) => n.id),
    }));
}
