import { z } from "zod";

export const NODE_KINDS = [
  // compute
  "service",
  "function",
  "worker",
  "agent",
  // data
  "database",
  "cache",
  "vectordb",
  "storage",
  // messaging
  "queue",
  "topic",
  "stream",
  // edge / networking
  "gateway",
  "cdn",
  "route",
  // architecture (hexagonal)
  "interface",
  "adapter",
  "port",
  // ai / ml
  "llm",
  "prompt",
  "tool",
  // identity
  "auth",
  // observability
  "observability",
  // cloud / infra
  "cloud",
  // ui / external
  "frontend",
  "external",
  // frontend (client-side)
  "page",
  "component",
  "store",
  "hook",
  // structural
  "module",
  "custom",
] as const;

export const NodeKindSchema = z.enum(NODE_KINDS);
export type NodeKind = z.infer<typeof NodeKindSchema>;

/**
 * Kinds that represent code in THIS repo. In `normal` (and `suggested`)
 * archik files, every node of a code-bearing kind must declare a
 * `sourcePath` pointing at the directory or file it represents — and
 * the path must exist on disk. The remaining kinds (`external`, infra,
 * abstract architecture, AI artifacts, route, etc.) are exempt because
 * they typically map to third-party systems, deployment concerns, or
 * conceptual contracts rather than checked-in files.
 *
 * Use `isCodeBearing(kind)` instead of comparing to this set directly
 * so the rule stays in one place.
 */
export const CODE_BEARING_KINDS: ReadonlySet<NodeKind> = new Set([
  "service",
  "function",
  "worker",
  "module",
  "page",
  "component",
  "store",
  "hook",
]);

export function isCodeBearing(kind: NodeKind): boolean {
  return CODE_BEARING_KINDS.has(kind);
}
