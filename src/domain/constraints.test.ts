import { describe, expect, it } from "vitest";
import { checkConstraints } from "./constraints.ts";
import type { LoadedDoc } from "../io/discovery.ts";
import type { Document, Edge, Node } from "./types.ts";

const node = (id: string, extra: Partial<Node> = {}): Node => ({
  id,
  kind: "service",
  name: id,
  description: "x",
  ...extra,
});

const loaded = (
  doc: Partial<Document>,
  relPath = ".archik/main.archik.yaml",
): LoadedDoc => ({
  abs: `/p/${relPath}`,
  relPath,
  doc: {
    version: "1.0",
    name: "Demo",
    nodes: [],
    edges: [],
    ...doc,
  },
});

const edge = (id: string, from: string, to: string, extra: Partial<Edge> = {}): Edge => ({
  id,
  from,
  to,
  relationship: "writes",
  ...extra,
});

describe("checkConstraints / forbidEdge", () => {
  const billingNodes: Node[] = [
    node("billing", { kind: "module" }),
    node("billing-svc", { parentId: "billing" }),
    node("billing-db", { kind: "database" }),
    node("orders-svc"),
  ];

  it("flags an edge from outside the protected context", () => {
    const docs = [
      loaded({
        nodes: billingNodes,
        edges: [edge("bad", "orders-svc", "billing-db")],
        constraints: [
          {
            id: "billing-isolation",
            description: "Only billing-context nodes write to billing-db.",
            forbidEdge: {
              relationship: "writes",
              from: { notParent: "billing" },
              to: { id: "billing-db" },
            },
          },
        ],
      }),
    ];
    const errors = checkConstraints(docs);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('edge "bad"');
    expect(errors[0]!.message).toContain("billing-isolation");
  });

  it("allows an edge from inside the protected context", () => {
    const docs = [
      loaded({
        nodes: billingNodes,
        edges: [edge("good", "billing-svc", "billing-db")],
        constraints: [
          {
            id: "billing-isolation",
            description: "Only billing-context nodes write to billing-db.",
            forbidEdge: {
              relationship: "writes",
              from: { notParent: "billing" },
              to: { id: "billing-db" },
            },
          },
        ],
      }),
    ];
    expect(checkConstraints(docs)).toEqual([]);
  });

  it("respects the relationship filter", () => {
    const docs = [
      loaded({
        nodes: billingNodes,
        edges: [edge("read", "orders-svc", "billing-db", { relationship: "reads" })],
        constraints: [
          {
            id: "billing-isolation",
            description: "Only billing writes to billing-db.",
            forbidEdge: {
              relationship: "writes",
              to: { id: "billing-db" },
            },
          },
        ],
      }),
    ];
    expect(checkConstraints(docs)).toEqual([]);
  });

  it("skips edges in the except list", () => {
    const docs = [
      loaded({
        nodes: billingNodes,
        edges: [edge("grandfathered", "orders-svc", "billing-db")],
        constraints: [
          {
            id: "billing-isolation",
            description: "Only billing writes to billing-db.",
            forbidEdge: { to: { id: "billing-db" } },
            except: ["grandfathered"],
          },
        ],
      }),
    ];
    expect(checkConstraints(docs)).toEqual([]);
  });

  it("matches by kind selector — frontend never hits a database", () => {
    const docs = [
      loaded({
        nodes: [node("web", { kind: "frontend" }), node("db", { kind: "database" })],
        edges: [edge("direct", "web", "db", { relationship: "reads" })],
        constraints: [
          {
            id: "no-frontend-db",
            description: "Frontends go through services, never the DB.",
            forbidEdge: { from: { kind: "frontend" }, to: { kind: "database" } },
          },
        ],
      }),
    ];
    const errors = checkConstraints(docs);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("no-frontend-db");
  });

  it("checks edges across sub-files against root constraints", () => {
    const root = loaded({
      nodes: [node("db", { kind: "database" })],
      constraints: [
        {
          id: "no-frontend-db",
          description: "Frontends go through services.",
          forbidEdge: { from: { kind: "frontend" }, to: { kind: "database" } },
        },
      ],
    });
    const sub = loaded(
      {
        nodes: [node("web", { kind: "frontend" })],
        edges: [edge("direct", "web", "db", { relationship: "reads", toFile: ".archik/main.archik.yaml" })],
      },
      ".archik/ui.archik.yaml",
    );
    const errors = checkConstraints([root, sub]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain(".archik/ui.archik.yaml");
  });
});

describe("checkConstraints / requireOwner", () => {
  it("flags matching nodes without an owner", () => {
    const docs = [
      loaded({
        nodes: [
          node("api", { owner: "team-core" }),
          node("worker", { kind: "worker" }),
          node("stripe", { kind: "external" }),
        ],
        constraints: [
          {
            id: "services-owned",
            description: "Every service and worker declares an owning team.",
            requireOwner: { kinds: ["service", "worker"] },
          },
        ],
      }),
    ];
    const errors = checkConstraints(docs);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('node "worker"');
  });

  it("applies to all nodes when kinds is omitted, minus except", () => {
    const docs = [
      loaded({
        nodes: [node("api"), node("stripe", { kind: "external" })],
        constraints: [
          {
            id: "all-owned",
            description: "Everything has an owner.",
            requireOwner: {},
            except: ["stripe"],
          },
        ],
      }),
    ];
    const errors = checkConstraints(docs);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('node "api"');
  });
});

describe("checkConstraints / requireEdge", () => {
  const nodes: Node[] = [
    node("auth", { kind: "auth" }),
    node("api"),
    node("internal-api"),
  ];

  it("flags a node missing the required incoming edge", () => {
    const docs = [
      loaded({
        nodes,
        edges: [edge("auth-api", "auth", "api", { relationship: "routes_to" })],
        constraints: [
          {
            id: "services-behind-auth",
            description: "Every service sits behind the auth node.",
            requireEdge: { node: { kind: "service" }, from: { kind: "auth" } },
          },
        ],
      }),
    ];
    const errors = checkConstraints(docs);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('node "internal-api"');
  });

  it("supports the outgoing direction and relationship filter", () => {
    const docs = [
      loaded({
        nodes: [
          node("worker", { kind: "worker" }),
          node("dlq", { kind: "queue" }),
        ],
        edges: [
          edge("w-dlq", "worker", "dlq", { relationship: "publishes" }),
        ],
        constraints: [
          {
            id: "workers-have-dlq",
            description: "Every worker publishes to a queue (DLQ).",
            requireEdge: {
              node: { kind: "worker" },
              to: { kind: "queue" },
              relationship: "publishes",
            },
          },
        ],
      }),
    ];
    expect(checkConstraints(docs)).toEqual([]);
  });

  it("respects except", () => {
    const docs = [
      loaded({
        nodes,
        edges: [],
        constraints: [
          {
            id: "services-behind-auth",
            description: "Every service sits behind the auth node.",
            requireEdge: { node: { kind: "service" }, from: { kind: "auth" } },
            except: ["api", "internal-api"],
          },
        ],
      }),
    ];
    expect(checkConstraints(docs)).toEqual([]);
  });
});

describe("checkConstraints / maxDependencies", () => {
  it("flags a node over the outgoing-edge budget", () => {
    const docs = [
      loaded({
        nodes: [node("god"), node("a"), node("b"), node("c")],
        edges: [
          edge("g-a", "god", "a", { relationship: "invokes" }),
          edge("g-b", "god", "b", { relationship: "invokes" }),
          edge("g-c", "god", "c", { relationship: "invokes" }),
        ],
        constraints: [
          {
            id: "no-god-services",
            description: "Services keep at most 2 outgoing dependencies.",
            maxDependencies: { node: { kind: "service" }, max: 2 },
          },
        ],
      }),
    ];
    const errors = checkConstraints(docs);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('node "god"');
    expect(errors[0]!.message).toContain("max is 2");
  });

  it("filters by relationship when set", () => {
    const docs = [
      loaded({
        nodes: [node("api"), node("db", { kind: "database" }), node("cache", { kind: "cache" })],
        edges: [
          edge("a-d", "api", "db", { relationship: "writes" }),
          edge("a-c", "api", "cache", { relationship: "reads" }),
        ],
        constraints: [
          {
            id: "one-write-target",
            description: "A service writes to at most one store.",
            maxDependencies: { node: { kind: "service" }, max: 1, relationship: "writes" },
          },
        ],
      }),
    ];
    expect(checkConstraints(docs)).toEqual([]);
  });
});

describe("checkConstraints / ids", () => {
  it("rejects duplicate constraint ids across files", () => {
    const c = {
      id: "all-owned",
      description: "Everything has an owner.",
      requireOwner: { kinds: ["service" as const] },
    };
    const root = loaded({ nodes: [node("api", { owner: "t" })], constraints: [c] });
    const sub = loaded({ constraints: [c] }, ".archik/sub.archik.yaml");
    const errors = checkConstraints([root, sub]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("duplicate constraint id");
  });
});
