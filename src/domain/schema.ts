import { z } from "zod";
import { NodeKindSchema } from "./taxonomy.ts";
import { RelationshipSchema } from "./relationships.ts";

export const NodeStatusSchema = z.enum(["proposed", "active", "deprecated"]);

/**
 * Relative path from project root to a node's source code.
 * Constraints: no leading `/`, no `..`, forward slashes only.
 */
export const SourcePathSchema = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/"), {
    message: "sourcePath must be a relative path (no leading /)",
  })
  .refine((p) => !p.includes("\\"), {
    message: "sourcePath must use forward slashes",
  })
  .refine(
    (p) => !p.split("/").some((seg) => seg === ".."),
    { message: "sourcePath must not contain `..` segments" },
  );

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export const IdSchema = z
  .string()
  .regex(ID_PATTERN, "id must match /^[a-z][a-z0-9-]*$/");

/**
 * `archikFile` is a relative path to another archik document — used
 * to hang a sub-architecture off a node so the canvas can drill into
 * it. Constraints (enforced at parse time):
 *   - must be relative (no leading `/`, no Windows drive letter)
 *   - must use forward slashes
 *   - must NOT contain `..` segments (no escaping the project root)
 *   - must end in `.archik.yaml` (extension is the file-type marker)
 * Cycle / existence checks are runtime — the canvas decides whether
 * the file actually loads.
 */
export const ArchikFilePathSchema = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/") && !/^[a-zA-Z]:[\\/]/.test(p), {
    message: "archikFile must be a relative path",
  })
  .refine((p) => !p.includes("\\"), {
    message: "archikFile must use forward slashes",
  })
  .refine(
    (p) => !p.split("/").some((seg) => seg === "..") && !p.includes("./../"),
    { message: "archikFile must not contain `..` segments" },
  )
  .refine((p) => p.endsWith(".archik.yaml"), {
    message: "archikFile must end in `.archik.yaml`",
  });

export const InterfaceSchema = z.strictObject({
  name: z.string().min(1),
  protocol: z.string().min(1),
  description: z.string().optional(),
});

export const NodeSchema = z.strictObject({
  id: IdSchema,
  kind: NodeKindSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  stack: z.string().optional(),
  responsibilities: z.array(z.string().min(1)).optional(),
  interfaces: z.array(InterfaceSchema).optional(),
  notes: z.array(z.string()).optional(),
  parentId: IdSchema.optional(),
  /** Drill-down: relative path to another archik file capturing this
   *  node's internal architecture. The canvas shows a "↓ open" affordance
   *  on the node and navigates to that file when the user opens it. */
  archikFile: ArchikFilePathSchema.optional(),
  /** Relative path to this node's source code on disk. Used by
   *  `archik drift` to detect when the diagram diverges from reality. */
  sourcePath: SourcePathSchema.optional(),
  /** Lifecycle status. `proposed` = not built yet, `deprecated` = being
   *  phased out. Drift only checks nodes with status `active` (default). */
  status: NodeStatusSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const EdgeSchema = z.strictObject({
  id: IdSchema,
  from: IdSchema,
  to: IdSchema,
  relationship: RelationshipSchema,
  label: z.string().optional(),
  description: z.string().optional(),
  protocol: z.string().optional(),
  /** Optional per-edge stroke color override (any CSS color). */
  color: z.string().optional(),
  /** Cross-file reference: when set, `from` is a node id in another
   *  archik file (the path is here). The local renderer treats the
   *  edge as outbound — only the endpoint that's local to *this*
   *  file gets laid out. */
  fromFile: ArchikFilePathSchema.optional(),
  /** Cross-file reference: when set, `to` is a node id in another
   *  archik file (the path is here). The local renderer treats the
   *  edge as inbound — only the endpoint that's local to *this*
   *  file gets laid out. */
  toFile: ArchikFilePathSchema.optional(),
});

/**
 * Marker block that turns a regular document into a "suggestion"
 * sidecar. When present, archik treats the file as Claude's draft of
 * a proposed architecture change rather than the source of truth.
 *
 *   metadata:
 *     suggestion:
 *       from: "architecture.archik.yaml"   # the file this proposes to change
 *       at: "2026-04-26T17:00:00Z"          # when the suggestion was authored
 *       note: "add Stripe payment flow"     # optional one-liner
 */
export const SuggestionMetadataSchema = z.strictObject({
  from: z.string().min(1),
  at: z.string().min(1),
  note: z.string().optional(),
});

export const DocumentMetadataSchema = z.strictObject({
  createdAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1).optional(),
  suggestion: SuggestionMetadataSchema.optional(),
});

export const DocumentSchema = z
  .strictObject({
    version: z.literal("1.0"),
    name: z.string().min(1),
    description: z.string().optional(),
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema),
    metadata: DocumentMetadataSchema.optional(),
  })
  // Cross-reference invariants. Without these, the structural schema
  // happily accepts dangling edges / parentId, duplicate ids, parent
  // cycles, etc., and downstream code (layout, diff, render) silently
  // produces the wrong picture.
  .superRefine((doc, ctx) => {
    const nodeIds = new Set<string>();
    for (let i = 0; i < doc.nodes.length; i++) {
      const node = doc.nodes[i]!;
      if (nodeIds.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", i, "id"],
          message: `duplicate node id "${node.id}"`,
        });
      }
      nodeIds.add(node.id);
    }

    const edgeIds = new Set<string>();
    for (let i = 0; i < doc.edges.length; i++) {
      const edge = doc.edges[i]!;
      if (edgeIds.has(edge.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i, "id"],
          message: `duplicate edge id "${edge.id}"`,
        });
      }
      edgeIds.add(edge.id);

      // Cross-file endpoints (fromFile / toFile) are exempt from the
      // "must be a known node" check — that node lives in another
      // file and we don't load it here. The id format check from
      // IdSchema still applies.
      if (edge.fromFile === undefined && !nodeIds.has(edge.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i, "from"],
          message: `edge "${edge.id}" references unknown node "${edge.from}"`,
        });
      }
      if (edge.toFile === undefined && !nodeIds.has(edge.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i, "to"],
          message: `edge "${edge.id}" references unknown node "${edge.to}"`,
        });
      }
      // A fully cross-file edge (both endpoints elsewhere) doesn't
      // belong in any single file — author it in one of the two
      // referenced files instead.
      if (edge.fromFile !== undefined && edge.toFile !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i],
          message:
            `edge "${edge.id}" has both fromFile and toFile — at least one endpoint must be local to this file`,
        });
      }
      if (
        edge.from === edge.to &&
        edge.fromFile === undefined &&
        edge.toFile === undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i],
          message: `edge "${edge.id}" is a self-loop (from === to). Self-loops aren't meaningful in an architecture diagram.`,
        });
      }
    }

    // parentId integrity — exists, no self-parent, no cycle.
    const parentOf = new Map<string, string | undefined>();
    for (const node of doc.nodes) parentOf.set(node.id, node.parentId);
    for (let i = 0; i < doc.nodes.length; i++) {
      const node = doc.nodes[i]!;
      if (node.parentId === undefined) continue;
      if (node.parentId === node.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", i, "parentId"],
          message: `node "${node.id}" lists itself as parentId`,
        });
        continue;
      }
      if (!nodeIds.has(node.parentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", i, "parentId"],
          message: `node "${node.id}" parentId "${node.parentId}" doesn't match any node`,
        });
        continue;
      }
      // Walk up the parent chain to detect cycles. Bound the walk by
      // the total node count so a cycle can't loop forever.
      const seen = new Set<string>([node.id]);
      let cursor: string | undefined = node.parentId;
      let steps = 0;
      while (cursor !== undefined && steps <= doc.nodes.length) {
        if (seen.has(cursor)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["nodes", i, "parentId"],
            message: `node "${node.id}" is part of a parentId cycle (via "${cursor}")`,
          });
          break;
        }
        seen.add(cursor);
        cursor = parentOf.get(cursor);
        steps++;
      }
    }

    // Parent-chain edges: a node's parent already CONTAINS the node
    // visually (it's drawn as a container), so an edge between them
    // is a structural duplicate that confuses the layout and reads
    // as "this thing depends on its own bag." Reject any edge whose
    // endpoints sit on the same parent chain (parent ↔ child, or
    // grandparent ↔ grandchild). Cross-file edges are exempt — the
    // remote endpoint isn't local, so containment doesn't apply.
    function isAncestor(ancestor: string, descendant: string): boolean {
      let cursor = parentOf.get(descendant);
      let steps = 0;
      while (cursor !== undefined && steps <= doc.nodes.length) {
        if (cursor === ancestor) return true;
        cursor = parentOf.get(cursor);
        steps++;
      }
      return false;
    }
    for (let i = 0; i < doc.edges.length; i++) {
      const edge = doc.edges[i]!;
      if (edge.fromFile !== undefined || edge.toFile !== undefined) continue;
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
      if (isAncestor(edge.from, edge.to) || isAncestor(edge.to, edge.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i],
          message:
            `edge "${edge.id}" connects "${edge.from}" and "${edge.to}" but one is an ancestor of the other ` +
            `— the parent already contains the child, so an edge between them is a duplicate. ` +
            `Either remove the edge or change the parentId.`,
        });
      }
    }
  });

export const DOCUMENT_VERSION = "1.0" as const;
