import {
  Bot,
  Box,
  Brain,
  Cable,
  Cloud,
  Cog,
  Database,
  DoorOpen,
  ExternalLink,
  Eye,
  FunctionSquare,
  Globe,
  HardDrive,
  Layers,
  Lock,
  MessageSquare,
  Monitor,
  Package,
  Radio,
  Route,
  SendHorizontal,
  Server,
  Sparkles,
  Waves,
  Wrench,
} from "lucide-react";
import type { ComponentType } from "react";
import type { NodeKind } from "../domain/types.ts";
import { InterfaceIcon, SocketIcon } from "./customIcons.tsx";

/**
 * Slimmer icon contract that both lucide-react components and our own
 * custom SVGs satisfy — the renderer only needs size/color/strokeWidth.
 */
export type KindIcon = ComponentType<{
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
}>;

export type KindMeta = {
  /** Hex accent color used by the kind icon and the legend swatch. */
  color: string;
  /** Icon component used in node headers and the legend. */
  icon: KindIcon;
  /** Short one-liner shown in the legend popover. */
  description: string;
};

export const KIND_META: Record<NodeKind, KindMeta> = {
  // Compute --------------------------------------------------------------
  service: {
    color: "#38bdf8",
    icon: Server,
    description: "Long-running compute that owns business logic.",
  },
  function: {
    color: "#22d3ee",
    icon: FunctionSquare,
    description: "Stateless function-as-a-service / lambda.",
  },
  worker: {
    color: "#06b6d4",
    icon: Cog,
    description: "Background job processor or consumer loop.",
  },
  agent: {
    color: "#14b8a6",
    icon: Bot,
    description: "Autonomous AI agent driving tools and actions.",
  },

  // Data ----------------------------------------------------------------
  database: {
    color: "#34d399",
    icon: Database,
    description: "Persistent state — relational, document, key-value.",
  },
  cache: {
    color: "#a78bfa",
    icon: Layers,
    description: "In-memory store for fast reads.",
  },
  vectordb: {
    color: "#c084fc",
    icon: Sparkles,
    description: "Vector store for embeddings / similarity search.",
  },
  storage: {
    color: "#84cc16",
    icon: HardDrive,
    description: "Object / blob storage (S3, GCS, etc.).",
  },

  // Messaging -----------------------------------------------------------
  queue: {
    color: "#fbbf24",
    icon: SendHorizontal,
    description: "Asynchronous work queue with at-least-once delivery.",
  },
  topic: {
    color: "#f97316",
    icon: Radio,
    description: "Pub/sub topic with multiple consumers.",
  },
  stream: {
    color: "#fb923c",
    icon: Waves,
    description: "Append-only event log (Kafka, Kinesis).",
  },

  // Networking / edge ---------------------------------------------------
  gateway: {
    color: "#6366f1",
    icon: DoorOpen,
    description: "API gateway, ingress, edge router.",
  },
  cdn: {
    color: "#0ea5e9",
    icon: Globe,
    description: "Content delivery network / static edge.",
  },
  route: {
    color: "#f59e0b",
    icon: Route,
    description: "HTTP / URL route — path + method mapped to a handler.",
  },

  // Hexagonal architecture ----------------------------------------------
  interface: {
    color: "#d946ef",
    icon: InterfaceIcon,
    description: "Abstract contract — the <i> a system commits to.",
  },
  adapter: {
    color: "#c026d3",
    icon: Cable,
    description: "Concrete implementation of an interface.",
  },
  port: {
    color: "#a21caf",
    icon: SocketIcon,
    description: "Hexagonal-architecture port — the socket an adapter plugs into.",
  },

  // AI / ML -------------------------------------------------------------
  llm: {
    color: "#a855f7",
    icon: Brain,
    description: "Large language model service.",
  },
  prompt: {
    color: "#c4b5fd",
    icon: MessageSquare,
    description: "Prompt template / instruction set.",
  },
  tool: {
    color: "#fde047",
    icon: Wrench,
    description: "Tool callable by an agent or LLM.",
  },

  // Identity / security -------------------------------------------------
  auth: {
    color: "#ef4444",
    icon: Lock,
    description: "Identity provider, auth service.",
  },

  // Observability -------------------------------------------------------
  observability: {
    color: "#10b981",
    icon: Eye,
    description: "Metrics, logs, traces — operational telemetry.",
  },

  // Cloud / infra -------------------------------------------------------
  cloud: {
    color: "#0284c7",
    icon: Cloud,
    description: "Managed cloud service (compute, hosted, etc.).",
  },

  // UI -----------------------------------------------------------------
  frontend: {
    color: "#f472b6",
    icon: Monitor,
    description: "User-facing surface — browser, mobile, CLI.",
  },

  // External -----------------------------------------------------------
  external: {
    color: "#94a3b8",
    icon: ExternalLink,
    description: "Third-party system you don't own.",
  },

  // Structural ---------------------------------------------------------
  module: {
    color: "#7dd3fc",
    icon: Package,
    description: "Module / component grouping (logical container).",
  },
  custom: {
    color: "#64748b",
    icon: Box,
    description: "Container or anything not in the taxonomy.",
  },
};
