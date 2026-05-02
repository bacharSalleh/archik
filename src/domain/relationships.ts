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
