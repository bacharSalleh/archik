import type { NodeKind } from "../domain/types.ts";

export type KindMeta = {
  /** Hex color used as a small accent tag on the node and in the legend. */
  color: string;
  /** Short one-liner shown in the legend popover. */
  description: string;
};

export const KIND_META: Record<NodeKind, KindMeta> = {
  service: {
    color: "#38bdf8",
    description: "Long-running compute that owns business logic.",
  },
  database: {
    color: "#34d399",
    description: "Persistent state — relational, document, etc.",
  },
  queue: {
    color: "#fbbf24",
    description: "Asynchronous message bus or event log.",
  },
  cache: {
    color: "#a78bfa",
    description: "In-memory store for fast reads.",
  },
  frontend: {
    color: "#f472b6",
    description: "User-facing surface — browser, mobile, CLI.",
  },
  external: {
    color: "#94a3b8",
    description: "Third-party system you don't run.",
  },
  function: {
    color: "#22d3ee",
    description: "Stateless function-as-a-service / lambda.",
  },
  custom: {
    color: "#64748b",
    description: "Container or anything not in the taxonomy.",
  },
};
