import { z } from "zod";

export const RELATIONSHIPS = [
  // synchronous calls — short-lived request/response over the wire
  "http_call",       // generic HTTP / REST call
  "grpc",            // typed RPC (protobuf, Connect, etc.)
  "invokes",         // function/agent/lambda invocation
  "routes_to",       // gateway / router forwarding requests
  // bidirectional / persistent / async wire protocols
  "websocket",       // long-lived bidirectional WS connection
  "webhook",         // async callback the other party pushes to us
  // data access
  "reads",
  "writes",
  // messaging
  "publishes",
  "subscribes",
  "streams_to",
  // architectural / structural
  "implements",      // adapter implements an abstract interface
  "extends",         // UML inheritance — subtype of another type
  "depends_on",      // package / build-level dependency
  "has_a",           // owns or contains — whole/part relationship
  "uses",            // lightest-weight relationship
] as const;

export const RelationshipSchema = z.enum(RELATIONSHIPS);
export type Relationship = z.infer<typeof RelationshipSchema>;

/**
 * Coarse category for each relationship. `runtime` = something that
 * happens when the system runs (calls, reads/writes, messaging).
 * `structural` = static / lightweight coupling. The canvas "hide weak
 * edges" toggle and `render --hide-structural` drop the structural set;
 * complexity reporting uses it informationally.
 */
export type RelationshipCategory = "runtime" | "structural";

export const RELATIONSHIP_CATEGORY: Record<Relationship, RelationshipCategory> = {
  http_call: "runtime",
  grpc: "runtime",
  invokes: "runtime",
  routes_to: "runtime",
  websocket: "runtime",
  webhook: "runtime",
  reads: "runtime",
  writes: "runtime",
  publishes: "runtime",
  subscribes: "runtime",
  streams_to: "runtime",
  implements: "structural",
  extends: "structural",
  depends_on: "structural",
  has_a: "structural",
  uses: "structural",
};

export function relationshipCategory(rel: Relationship): RelationshipCategory {
  return RELATIONSHIP_CATEGORY[rel];
}

/**
 * Short one-liners shown in the canvas legend's Relationships section.
 * Lives next to the enum so a new relationship can't ship without a
 * description (exhaustive Record).
 */
export const RELATIONSHIP_DESCRIPTION: Record<Relationship, string> = {
  http_call: "generic HTTP / REST call",
  grpc: "typed RPC (protobuf, Connect, etc.)",
  invokes: "function / agent / lambda invocation",
  routes_to: "gateway / router forwarding requests",
  websocket: "long-lived bidirectional connection",
  webhook: "async callback the other party pushes to us",
  reads: "reads data from the target",
  writes: "writes data to the target",
  publishes: "publishes messages / events",
  subscribes: "consumes messages / events",
  streams_to: "appends to an event stream",
  implements: "UML realization — dashed, hollow triangle",
  extends: "UML generalization — solid, hollow triangle",
  depends_on: "UML dependency — dashed, open arrow",
  has_a: "UML composition — diamond at the owner end",
  uses: "lightweight usage — solid, open arrow",
};
