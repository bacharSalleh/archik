import { describe, it, expect } from "vitest";
import {
  DocumentSchema,
  EdgeSchema,
  IdSchema,
  InterfaceSchema,
  NodeSchema,
} from "./schema.ts";

describe("InterfaceSchema", () => {
  it("accepts a minimal interface (name + protocol)", () => {
    expect(
      InterfaceSchema.safeParse({ name: "POST /orders", protocol: "http" })
        .success,
    ).toBe(true);
  });

  it("accepts an optional description", () => {
    expect(
      InterfaceSchema.safeParse({
        name: "POST /orders",
        protocol: "http",
        description: "Place an order",
      }).success,
    ).toBe(true);
  });

  it("rejects when name is missing", () => {
    expect(InterfaceSchema.safeParse({ protocol: "http" }).success).toBe(false);
  });

  it("rejects when protocol is missing", () => {
    expect(InterfaceSchema.safeParse({ name: "POST /orders" }).success).toBe(
      false,
    );
  });

  it("rejects unknown keys (no silent drift)", () => {
    expect(
      InterfaceSchema.safeParse({
        name: "x",
        protocol: "http",
        version: "v1",
      }).success,
    ).toBe(false);
  });
});

describe("IdSchema", () => {
  it.each(["a", "api", "user-service", "service-1", "v2-api", "x9"])(
    "accepts valid id %s",
    (id) => {
      expect(IdSchema.safeParse(id).success).toBe(true);
    },
  );

  it.each([
    ["empty", ""],
    ["leading uppercase", "Service"],
    ["all uppercase", "API"],
    ["leading digit", "1service"],
    ["leading hyphen", "-service"],
    ["underscore", "user_service"],
    ["space", "user service"],
    ["dot", "user.service"],
    ["slash", "user/service"],
  ])("rejects %s id (%s)", (_label, id) => {
    expect(IdSchema.safeParse(id).success).toBe(false);
  });
});

describe("NodeSchema", () => {
  const minimal = { id: "api", kind: "service", name: "API", description: "test fixture" };

  it("accepts the minimal valid node", () => {
    expect(NodeSchema.safeParse(minimal).success).toBe(true);
  });

  it.each(["id", "kind", "name"] as const)("rejects when %s missing", (key) => {
    const partial = { ...minimal };
    delete (partial as Partial<typeof minimal>)[key];
    expect(NodeSchema.safeParse(partial).success).toBe(false);
  });

  it("accepts all optional fields together", () => {
    const node = {
      id: "orders",
      kind: "service",
      name: "Orders",
      description: "Owns order lifecycle",
      stack: "Go + Postgres",
      responsibilities: ["place orders", "track shipments"],
      interfaces: [
        { name: "POST /orders", protocol: "http" },
        { name: "order.placed", protocol: "kafka" },
      ],
      parentId: "platform",
      metadata: { team: "fulfillment", oncall: true, version: 3 },
    };
    expect(NodeSchema.safeParse(node).success).toBe(true);
  });

  it("rejects an unknown node kind", () => {
    expect(
      NodeSchema.safeParse({ ...minimal, kind: "loadbalancer" }).success,
    ).toBe(false);
  });

  it("rejects an x coordinate (no coordinates ever)", () => {
    expect(NodeSchema.safeParse({ ...minimal, x: 100 }).success).toBe(false);
  });

  it("rejects a y coordinate (no coordinates ever)", () => {
    expect(NodeSchema.safeParse({ ...minimal, y: 200 }).success).toBe(false);
  });

  it("rejects width/height (no coordinates ever)", () => {
    expect(
      NodeSchema.safeParse({ ...minimal, width: 100, height: 50 }).success,
    ).toBe(false);
  });

  it("rejects an invalid parentId", () => {
    expect(
      NodeSchema.safeParse({ ...minimal, parentId: "Platform" }).success,
    ).toBe(false);
  });

  describe("archikFile", () => {
    const accept = (p: string): boolean =>
      NodeSchema.safeParse({ ...minimal, archikFile: p }).success;

    it("accepts a relative path ending in .archik.yaml", () => {
      expect(accept(".archik/orders.archik.yaml")).toBe(true);
      expect(accept("services/orders.archik.yaml")).toBe(true);
      expect(accept("orders.archik.yaml")).toBe(true);
    });

    it("rejects an absolute path", () => {
      expect(accept("/etc/passwd.archik.yaml")).toBe(false);
    });

    it("rejects a Windows drive-letter path", () => {
      expect(accept("C:/foo/bar.archik.yaml")).toBe(false);
    });

    it("rejects a path containing `..` segments", () => {
      expect(accept("../escape.archik.yaml")).toBe(false);
      expect(accept(".archik/../../etc.archik.yaml")).toBe(false);
    });

    it("rejects backslash separators", () => {
      expect(accept(".archik\\orders.archik.yaml")).toBe(false);
    });

    it("rejects paths without the .archik.yaml extension", () => {
      expect(accept("orders.yaml")).toBe(false);
      expect(accept("orders.json")).toBe(false);
      expect(accept("orders")).toBe(false);
    });
  });
});

describe("EdgeSchema", () => {
  const minimal = {
    id: "api-to-db",
    from: "api",
    to: "db",
    relationship: "writes",
  };

  it("accepts the minimal valid edge", () => {
    expect(EdgeSchema.safeParse(minimal).success).toBe(true);
  });

  it.each(["id", "from", "to", "relationship"] as const)(
    "rejects when %s missing",
    (key) => {
      const partial = { ...minimal };
      delete (partial as Partial<typeof minimal>)[key];
      expect(EdgeSchema.safeParse(partial).success).toBe(false);
    },
  );

  it("accepts label, description, protocol", () => {
    expect(
      EdgeSchema.safeParse({
        ...minimal,
        label: "writes orders",
        description: "INSERT INTO orders",
        protocol: "tcp",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown relationship", () => {
    expect(
      EdgeSchema.safeParse({ ...minimal, relationship: "talks_to" }).success,
    ).toBe(false);
  });

  it("rejects coordinate-like fields on edges", () => {
    expect(
      EdgeSchema.safeParse({ ...minimal, points: [{ x: 0, y: 0 }] }).success,
    ).toBe(false);
  });

  describe("cross-file (fromFile / toFile)", () => {
    it("accepts an edge with toFile pointing at a peer file", () => {
      expect(
        EdgeSchema.safeParse({
          ...minimal,
          toFile: ".archik/payments.archik.yaml",
        }).success,
      ).toBe(true);
    });

    it("accepts an edge with fromFile pointing at a peer file", () => {
      expect(
        EdgeSchema.safeParse({
          ...minimal,
          fromFile: ".archik/upstream.archik.yaml",
        }).success,
      ).toBe(true);
    });

    it("rejects toFile with an absolute path", () => {
      expect(
        EdgeSchema.safeParse({
          ...minimal,
          toFile: "/etc/passwd.archik.yaml",
        }).success,
      ).toBe(false);
    });

    it("rejects toFile without the .archik.yaml extension", () => {
      expect(
        EdgeSchema.safeParse({ ...minimal, toFile: "foo.yaml" }).success,
      ).toBe(false);
    });
  });
});

describe("DocumentSchema", () => {
  const minimal = {
    version: "1.0",
    name: "Demo",
    nodes: [],
    edges: [],
  };

  it("accepts a minimal document with empty arrays", () => {
    expect(DocumentSchema.safeParse(minimal).success).toBe(true);
  });

  it("rejects when version is not '1.0'", () => {
    expect(DocumentSchema.safeParse({ ...minimal, version: "0.9" }).success)
      .toBe(false);
    expect(DocumentSchema.safeParse({ ...minimal, version: "2.0" }).success)
      .toBe(false);
  });

  it("rejects when version is missing", () => {
    const { version: _version, ...rest } = minimal;
    expect(DocumentSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects when nodes is missing", () => {
    const { nodes: _nodes, ...rest } = minimal;
    expect(DocumentSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects when edges is missing", () => {
    const { edges: _edges, ...rest } = minimal;
    expect(DocumentSchema.safeParse(rest).success).toBe(false);
  });

  it("accepts a populated document", () => {
    const doc = {
      version: "1.0",
      name: "Orders Platform",
      description: "End-to-end order pipeline",
      nodes: [
        { id: "api", kind: "service", name: "API", description: "test fixture" },
        { id: "db", kind: "database", name: "Orders DB", description: "test fixture" },
      ],
      edges: [
        {
          id: "api-writes-db",
          from: "api",
          to: "db",
          relationship: "writes",
        },
      ],
      metadata: {
        createdAt: "2026-04-25T00:00:00Z",
        updatedAt: "2026-04-25T00:00:00Z",
      },
    };
    expect(DocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("rejects unknown top-level keys (catches stray layout state)", () => {
    expect(
      DocumentSchema.safeParse({
        ...minimal,
        viewport: { x: 0, y: 0, zoom: 1 },
      }).success,
    ).toBe(false);
  });

  it("accepts metadata with only one of createdAt/updatedAt (both optional)", () => {
    expect(
      DocumentSchema.safeParse({
        ...minimal,
        metadata: { createdAt: "2026-04-25T00:00:00Z" },
      }).success,
    ).toBe(true);
  });

  it("accepts metadata.suggestion as a sidecar marker", () => {
    expect(
      DocumentSchema.safeParse({
        ...minimal,
        metadata: {
          suggestion: {
            from: "architecture.archik.yaml",
            at: "2026-04-26T17:00:00Z",
            note: "add Stripe",
          },
        },
      }).success,
    ).toBe(true);
  });

  describe("cross-reference rules", () => {
    const baseNodes = [
      { id: "api", kind: "service", name: "API", description: "test fixture" },
      { id: "db", kind: "database", name: "DB", description: "test fixture" },
    ];

    it("rejects an edge whose `from` references a missing node", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: baseNodes,
        edges: [
          { id: "e1", from: "ghost", to: "db", relationship: "writes" },
        ],
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(JSON.stringify(r.error.issues)).toContain("ghost");
      }
    });

    it("rejects an edge whose `to` references a missing node", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: baseNodes,
        edges: [
          { id: "e1", from: "api", to: "ghost", relationship: "writes" },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("rejects a self-loop edge", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: baseNodes,
        edges: [
          { id: "e1", from: "api", to: "api", relationship: "depends_on" },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("accepts a cross-file edge where `to` is unknown locally because toFile is set", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: baseNodes,
        edges: [
          {
            id: "api-pays",
            from: "api",
            to: "payments-api",
            toFile: ".archik/payments.archik.yaml",
            relationship: "http_call",
          },
        ],
      });
      expect(r.success).toBe(true);
    });

    it("accepts a cross-file edge where `from` is unknown locally because fromFile is set", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: baseNodes,
        edges: [
          {
            id: "upstream-api",
            from: "auth",
            fromFile: ".archik/auth.archik.yaml",
            to: "api",
            relationship: "invokes",
          },
        ],
      });
      expect(r.success).toBe(true);
    });

    it("rejects an edge that's cross-file at BOTH ends — author it elsewhere", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: baseNodes,
        edges: [
          {
            id: "x-y",
            from: "x",
            fromFile: ".archik/x.archik.yaml",
            to: "y",
            toFile: ".archik/y.archik.yaml",
            relationship: "http_call",
          },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("still rejects a dangling edge when no fromFile/toFile is set", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: baseNodes,
        edges: [
          { id: "e1", from: "api", to: "ghost", relationship: "writes" },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("rejects duplicate node ids", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: [
          { id: "api", kind: "service", name: "A", description: "test fixture" },
          { id: "api", kind: "service", name: "B", description: "test fixture" },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("rejects duplicate edge ids", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: baseNodes,
        edges: [
          { id: "e1", from: "api", to: "db", relationship: "writes" },
          { id: "e1", from: "db", to: "api", relationship: "reads" },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("rejects parentId pointing at a missing node", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: [
          ...baseNodes,
          { id: "child", kind: "service", name: "C", parentId: "ghost", description: "test fixture" },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("rejects a node whose parentId is itself", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: [{ id: "loop", kind: "service", name: "L", parentId: "loop", description: "test fixture" }],
      });
      expect(r.success).toBe(false);
    });

    it("rejects a parentId cycle", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: [
          { id: "a", kind: "module", name: "A", parentId: "b", description: "test fixture" },
          { id: "b", kind: "module", name: "B", parentId: "a", description: "test fixture" },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("accepts a deep but acyclic parent chain", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: [
          { id: "root", kind: "module", name: "Root", description: "test fixture" },
          { id: "mid", kind: "module", name: "Mid", parentId: "root", description: "test fixture" },
          { id: "leaf", kind: "service", name: "Leaf", parentId: "mid", description: "test fixture" },
        ],
      });
      expect(r.success).toBe(true);
    });

    it("rejects an edge from a parent to its direct child (container already contains it)", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: [
          { id: "container", kind: "module", name: "Container", description: "test fixture" },
          {
            id: "child",
            kind: "service",
            name: "Child",
            description: "test fixture",
            parentId: "container",
          },
        ],
        edges: [
          {
            id: "container-child",
            from: "container",
            to: "child",
            relationship: "uses",
          },
        ],
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        const msg = JSON.stringify(r.error.issues);
        expect(msg).toContain("ancestor");
      }
    });

    it("rejects an edge from a child up to its parent", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: [
          { id: "container", kind: "module", name: "Container", description: "test fixture" },
          {
            id: "child",
            kind: "service",
            name: "Child",
            description: "test fixture",
            parentId: "container",
          },
        ],
        edges: [
          {
            id: "child-container",
            from: "child",
            to: "container",
            relationship: "depends_on",
          },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("rejects an edge between grandparent and grandchild (full parent chain)", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: [
          { id: "root", kind: "module", name: "Root", description: "test fixture" },
          { id: "mid", kind: "module", name: "Mid", parentId: "root", description: "test fixture" },
          { id: "leaf", kind: "service", name: "Leaf", parentId: "mid", description: "test fixture" },
        ],
        edges: [
          {
            id: "root-leaf",
            from: "root",
            to: "leaf",
            relationship: "uses",
          },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("accepts edges between siblings under the same container", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: [
          { id: "container", kind: "module", name: "Container", description: "test fixture" },
          { id: "a", kind: "service", name: "A", parentId: "container", description: "test fixture" },
          { id: "b", kind: "service", name: "B", parentId: "container", description: "test fixture" },
        ],
        edges: [
          { id: "a-b", from: "a", to: "b", relationship: "http_call" },
        ],
      });
      expect(r.success).toBe(true);
    });

    it("rejects two edges with the same (from, to, relationship) tuple", () => {
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: baseNodes,
        edges: [
          { id: "api-db-1", from: "api", to: "db", relationship: "writes" },
          { id: "api-db-2", from: "api", to: "db", relationship: "writes" },
        ],
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        const msg = JSON.stringify(r.error.issues);
        // Error points at the second edge and names the first.
        expect(msg).toContain("api-db-2");
        expect(msg).toContain("api-db-1");
        expect(msg).toContain("duplicates");
      }
    });

    it("accepts two edges between the same pair when the relationship differs", () => {
      // service ↔ db with both `reads` and `writes` is a valid
      // distinction the diagram should be able to express.
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: baseNodes,
        edges: [
          { id: "api-reads", from: "api", to: "db", relationship: "reads" },
          { id: "api-writes", from: "api", to: "db", relationship: "writes" },
        ],
      });
      expect(r.success).toBe(true);
    });

    it("does not flag a duplicate when one of the edges is cross-file", () => {
      // A cross-file edge can legitimately mirror a local one — the
      // remote endpoint isn't loaded so we can't compare honestly.
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: baseNodes,
        edges: [
          { id: "local", from: "api", to: "db", relationship: "writes" },
          {
            id: "remote",
            from: "api",
            to: "db",
            toFile: ".archik/other.archik.yaml",
            relationship: "writes",
          },
        ],
      });
      expect(r.success).toBe(true);
    });

    it("accepts a parent↔child edge when the remote endpoint is cross-file", () => {
      // The parent-chain rule only applies within a single file —
      // a cross-file edge by definition can't be part of this
      // file's parent hierarchy, so the check is skipped.
      const r = DocumentSchema.safeParse({
        ...minimal,
        nodes: [
          { id: "container", kind: "module", name: "Container", description: "test fixture" },
          {
            id: "child",
            kind: "service",
            name: "Child",
            description: "test fixture",
            parentId: "container",
          },
        ],
        edges: [
          {
            id: "child-remote",
            from: "child",
            to: "container",
            toFile: ".archik/other.archik.yaml",
            relationship: "http_call",
          },
        ],
      });
      expect(r.success).toBe(true);
    });
  });
});
