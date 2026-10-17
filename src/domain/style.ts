/**
 * Architecture style — the structure the architect wants the code to
 * follow, declared once in the root document and enforced on every
 * change (validate, suggest set, canvas save), like a constraint.
 *
 * Layered styles (layered, hexagonal, clean) order named layers from
 * the outside / top to the inside / bottom. A node sits in a layer via
 * `layer:` (children inherit their parent's layer). Dependencies may
 * point to the same layer or further in / down — never back out — and
 * only the outermost "infrastructure" layer may depend on `external`
 * systems.
 *
 * Module styles (modular-monolith, feature-slices) treat each
 * top-level node as a module. A modular monolith lets modules use each
 * other only through an `interface` / `port` node (or a `shared`
 * module); feature slices never depend on each other, only on shared
 * modules.
 *
 * Pure: works on loaded docs, returns errors + advisory hints.
 */
import { z } from "zod";
import type { LoadedDoc } from "../io/discovery.ts";
import type { Node } from "./types.ts";
import type { ValidationError } from "./validate.ts";

export const STYLE_KINDS = [
  "layered",
  "hexagonal",
  "clean",
  "modular-monolith",
  "feature-slices",
] as const;
export type StyleKind = (typeof STYLE_KINDS)[number];

const ORDERED: ReadonlySet<StyleKind> = new Set(["layered", "hexagonal", "clean"]);
const MODULAR: ReadonlySet<StyleKind> = new Set(["modular-monolith", "feature-slices"]);

const Name = z.string().regex(/^[a-z][a-z0-9-]*$/, "use lowercase kebab-case");

export const StyleSchema = z
  .strictObject({
    kind: z.enum(STYLE_KINDS),
    /** Layered kinds only: layer names, outside/top first. */
    layers: z.array(Name).min(2).optional(),
    /** Module kinds only: module ids every module may use. */
    shared: z.array(z.string().min(1)).min(1).optional(),
  })
  .superRefine((s, ctx) => {
    if (s.layers !== undefined && !ORDERED.has(s.kind)) {
      ctx.addIssue({ code: "custom", path: ["layers"], message: `layers are only used by layered, hexagonal and clean styles` });
    }
    if (s.shared !== undefined && !MODULAR.has(s.kind)) {
      ctx.addIssue({ code: "custom", path: ["shared"], message: `shared is only used by modular-monolith and feature-slices styles` });
    }
    if (s.layers !== undefined && new Set(s.layers).size !== s.layers.length) {
      ctx.addIssue({ code: "custom", path: ["layers"], message: "layer names must be unique" });
    }
  });

export type Style = z.infer<typeof StyleSchema>;

export type StyleInfo = {
  title: string;
  summary: string;
  rule: string;
  /** Default layer order (layered kinds). */
  layers: string[];
  /** The one layer allowed to depend on `external` nodes. */
  externalLayer: string | null;
  /** Default ring per layer when layers share a ring (lower = outer).
   *  Absent: each layer is its own ring, in order. */
  ranks?: Record<string, number>;
};

const INFO: Record<StyleKind, StyleInfo> = {
  layered: {
    title: "Layered",
    summary: "Horizontal layers from the user-facing edge down to infrastructure.",
    rule: "a layer may depend on its own layer and the layers below it — never above",
    layers: ["presentation", "application", "domain", "infrastructure"],
    externalLayer: "infrastructure",
  },
  hexagonal: {
    title: "Hexagonal (ports and adapters)",
    summary: "A core with no outside dependencies; adapters plug into it through ports.",
    rule: "adapters depend on the hexagon (its ports and core); the core and its ports never depend on an adapter",
    layers: ["adapters", "ports", "core"],
    externalLayer: "adapters",
    // Ports are part of the hexagon: the core defines and uses them.
    ranks: { adapters: 0, ports: 1, core: 1 },
  },
  clean: {
    title: "Clean architecture",
    summary: "Concentric rings; business rules in the middle know nothing about frameworks.",
    rule: "dependencies point inward — frameworks → interface adapters → application → domain",
    layers: ["frameworks", "interface-adapters", "application", "domain"],
    externalLayer: "frameworks",
  },
  "modular-monolith": {
    title: "Modular monolith",
    summary: "One deployable split into modules with clear public interfaces.",
    rule: "a module uses another module only through its interface / port node, or a shared module — never its internals",
    layers: [],
    externalLayer: null,
  },
  "feature-slices": {
    title: "Feature slices",
    summary: "Vertical slices, one per feature, each owning its whole stack.",
    rule: "a slice never depends on another slice — only on shared modules",
    layers: [],
    externalLayer: null,
  },
};

export function styleInfo(kind: StyleKind): StyleInfo {
  return INFO[kind];
}

/** The ordered layer names a style uses ([] for module styles). */
export function styleLayers(style: Style): string[] {
  return ORDERED.has(style.kind) ? (style.layers ?? INFO[style.kind].layers) : [];
}

/** Ring per layer name — outer rings have lower numbers. */
export function layerRanks(style: Style): Map<string, number> {
  const layers = styleLayers(style);
  const defaults = style.layers === undefined ? INFO[style.kind].ranks : undefined;
  return new Map(layers.map((l, i) => [l, defaults?.[l] ?? i]));
}

/** Each node's layer: its own, else the nearest ancestor's. */
export function effectiveLayers(nodes: readonly Node[]): Map<string, string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, string>();
  for (const n of nodes) {
    let cur: Node | undefined = n;
    let steps = 0;
    while (cur !== undefined && steps++ <= nodes.length) {
      if (cur.layer !== undefined) {
        out.set(n.id, cur.layer);
        break;
      }
      cur = cur.parentId === undefined ? undefined : byId.get(cur.parentId);
    }
  }
  return out;
}

function topModule(id: string, byId: Map<string, Node>): Node | undefined {
  let cur = byId.get(id);
  let steps = 0;
  while (cur?.parentId !== undefined && steps++ <= byId.size) {
    const up = byId.get(cur.parentId);
    if (up === undefined) break;
    cur = up;
  }
  return cur;
}

export type StyleCheck = {
  style: Style | null;
  errors: ValidationError[];
  /** Advisory only — e.g. nodes with no layer yet. */
  hints: string[];
};

/** The single style declared across the docs, or null / a conflict. */
export function findStyle(docs: LoadedDoc[]): { style: Style | null; conflict: string | null } {
  const found = docs.filter((d) => d.doc.style !== undefined);
  if (found.length === 0) return { style: null, conflict: null };
  const first = found[0]!;
  const other = found.find((d) => JSON.stringify(d.doc.style) !== JSON.stringify(first.doc.style));
  return {
    style: first.doc.style!,
    conflict:
      other === undefined
        ? null
        : `${first.relPath} and ${other.relPath} declare different styles — a system has one architecture style; keep it in the root file`,
  };
}

export function checkStyle(docs: LoadedDoc[]): StyleCheck {
  const { style, conflict } = findStyle(docs);
  if (style === null) return { style: null, errors: [], hints: [] };
  const errors: ValidationError[] = [];
  const hints: string[] = [];
  if (conflict !== null) errors.push({ path: "style", message: conflict });

  const nodes = docs.flatMap((d) => d.doc.nodes);
  const edges = docs.flatMap((d) => d.doc.edges);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const info = INFO[style.kind];
  const err = (path: string, message: string): void => {
    errors.push({ path, message });
  };

  if (ORDERED.has(style.kind)) {
    const layers = styleLayers(style);
    const rank = layerRanks(style);
    // Layered: the bottom layer talks to the outside. Rings: the outer one.
    const externalLayer = style.kind === "layered" ? layers[layers.length - 1]! : layers[0]!;
    for (const node of nodes) {
      if (node.layer !== undefined && !rank.has(node.layer)) {
        err(`nodes.${node.id}.layer`, `unknown layer "${node.layer}" on \`${node.id}\` — the ${style.kind} style has: ${layers.join(", ")}`);
      }
    }
    const layerOf = effectiveLayers(nodes);
    for (const edge of edges) {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (from === undefined || to === undefined) continue;
      const fl = layerOf.get(from.id);
      if (to.kind === "external") {
        if (fl !== undefined && rank.has(fl) && fl !== externalLayer) {
          err(
            `edges.${edge.id}`,
            `\`${from.id}\` (${fl}) depends on outside system \`${to.id}\` — only ${externalLayer} may depend on outside systems in the ${style.kind} style. ` +
              `fix: put the call in a ${externalLayer} node behind an interface or port that \`${from.id}\` uses.`,
          );
        }
        continue;
      }
      const tl = layerOf.get(to.id);
      if (fl === undefined || tl === undefined || !rank.has(fl) || !rank.has(tl)) continue;
      if (rank.get(tl)! < rank.get(fl)!) {
        err(
          `edges.${edge.id}`,
          `\`${from.id}\` (${fl}) depends on \`${to.id}\` (${tl}) — ${info.rule}. ` +
            `fix: reverse the dependency (\`${to.id}\` calls \`${from.id}\` through an interface in ${tl}), move the logic, or change a node's layer.`,
        );
      }
    }
    const unassigned = nodes.filter((n) => n.kind !== "external" && !layerOf.has(n.id)).map((n) => n.id);
    if (unassigned.length > 0) {
      hints.push(
        `${unassigned.length} node(s) have no layer, so the ${style.kind} rules skip them: ${unassigned.slice(0, 8).join(", ")}${unassigned.length > 8 ? ", …" : ""}`,
      );
    }
  } else {
    for (const node of nodes) {
      if (node.layer !== undefined) {
        err(`nodes.${node.id}.layer`, `\`layer\` is not used by the ${style.kind} style — remove it from \`${node.id}\`; top-level nodes are the modules`);
      }
    }
    const shared = new Set(style.shared ?? []);
    for (const id of shared) {
      if (!byId.has(id)) err("style.shared", `shared module "${id}" does not exist`);
    }
    for (const edge of edges) {
      const fm = topModule(edge.from, byId);
      const tm = topModule(edge.to, byId);
      if (fm === undefined || tm === undefined || fm.id === tm.id) continue;
      if (fm.kind === "external" || tm.kind === "external" || shared.has(tm.id)) continue;
      const target = byId.get(edge.to)!;
      if (style.kind === "feature-slices") {
        err(
          `edges.${edge.id}`,
          `slice \`${fm.id}\` depends on slice \`${tm.id}\` (\`${edge.from}\` → \`${edge.to}\`) — ${info.rule}. ` +
            `fix: move what both need into a shared module, or merge the slices.`,
        );
      } else if (target.id !== tm.id && target.kind !== "interface" && target.kind !== "port") {
        err(
          `edges.${edge.id}`,
          `\`${edge.from}\` (module \`${fm.id}\`) reaches into \`${edge.to}\` inside module \`${tm.id}\` — ${info.rule}. ` +
            `fix: add or use an interface / port node in \`${tm.id}\` and depend on that.`,
        );
      }
    }
  }
  return { style, errors, hints };
}

/** Where a node sits in the style and what it may depend on — the
 *  one-glance answer an agent needs before touching that code. */
export function nodePlacement(
  docs: LoadedDoc[],
  nodeId: string,
): { style: StyleKind; place: string; mayDependOn: string } | null {
  const { style } = findStyle(docs);
  if (style === null) return null;
  const nodes = docs.flatMap((d) => d.doc.nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (!byId.has(nodeId)) return null;
  const layers = styleLayers(style);
  if (layers.length > 0) {
    const layer = effectiveLayers(nodes).get(nodeId);
    if (layer === undefined || !layers.includes(layer)) {
      return { style: style.kind, place: "no layer", mayDependOn: "unchecked until it has a layer" };
    }
    const ranks = layerRanks(style);
    const allowed = layers.filter((l) => ranks.get(l)! >= ranks.get(layer)!);
    const ext = style.kind === "layered" ? layers[layers.length - 1] : layers[0];
    return {
      style: style.kind,
      place: `layer ${layer}`,
      mayDependOn: `${allowed.join(", ")}${layer === ext ? " and outside systems" : ""}`,
    };
  }
  const mod = topModule(nodeId, byId)!;
  const shared = style.shared ?? [];
  return {
    style: style.kind,
    place: `module ${mod.id}`,
    mayDependOn:
      style.kind === "feature-slices"
        ? `its own slice${shared.length > 0 ? ` and shared: ${shared.join(", ")}` : ""}`
        : `its own module, other modules' interface / port nodes${shared.length > 0 ? `, and shared: ${shared.join(", ")}` : ""}`,
  };
}
