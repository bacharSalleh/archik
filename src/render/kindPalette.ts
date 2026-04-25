import {
  Box,
  Database,
  ExternalLink,
  FunctionSquare,
  Layers,
  Monitor,
  SendHorizontal,
  Server,
  type LucideIcon,
} from "lucide-react";
import type { NodeKind } from "../domain/types.ts";

export type KindMeta = {
  /** Hex accent color used by the kind tag, lucide icon, and legend swatch. */
  color: string;
  /** Lucide icon component used in node headers and the legend. */
  icon: LucideIcon;
  /** Short one-liner shown in the legend popover. */
  description: string;
};

export const KIND_META: Record<NodeKind, KindMeta> = {
  service: {
    color: "#38bdf8",
    icon: Server,
    description: "Long-running compute that owns business logic.",
  },
  database: {
    color: "#34d399",
    icon: Database,
    description: "Persistent state — relational, document, etc.",
  },
  queue: {
    color: "#fbbf24",
    icon: SendHorizontal,
    description: "Asynchronous message bus or event log.",
  },
  cache: {
    color: "#a78bfa",
    icon: Layers,
    description: "In-memory store for fast reads.",
  },
  frontend: {
    color: "#f472b6",
    icon: Monitor,
    description: "User-facing surface — browser, mobile, CLI.",
  },
  external: {
    color: "#94a3b8",
    icon: ExternalLink,
    description: "Third-party system you don't run.",
  },
  function: {
    color: "#22d3ee",
    icon: FunctionSquare,
    description: "Stateless function-as-a-service / lambda.",
  },
  custom: {
    color: "#64748b",
    icon: Box,
    description: "Container or anything not in the taxonomy.",
  },
};
