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
  // structural
  "module",
  "custom",
] as const;

export const NodeKindSchema = z.enum(NODE_KINDS);
export type NodeKind = z.infer<typeof NodeKindSchema>;
