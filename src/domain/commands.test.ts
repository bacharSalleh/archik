import { describe, it, expect } from "vitest";
import { applyCommand, CommandError } from "./commands.ts";
import type { Document, Node } from "./types.ts";

const empty: Document = {
  version: "1.0",
  name: "Empty",
  nodes: [],
  edges: [],
};

const withTwoNodes: Document = {
  version: "1.0",
  name: "Pair",
  nodes: [
    { id: "api", kind: "service", name: "API" },
    { id: "db", kind: "database", name: "DB" },
  ],
  edges: [
    { id: "api-db", from: "api", to: "db", relationship: "writes" },
  ],
};

const apiNode: Node = { id: "api", kind: "service", name: "API" };

describe("applyCommand: rename_document", () => {
  it("returns a new document with the new name", () => {
    const next = applyCommand(empty, {
      type: "rename_document",
      name: "Renamed",
    });
    expect(next.name).toBe("Renamed");
  });

  it("does not mutate the input document", () => {
    applyCommand(empty, { type: "rename_document", name: "Renamed" });
    expect(empty.name).toBe("Empty");
  });
});

describe("applyCommand: add_node", () => {
  it("appends the node", () => {
    const next = applyCommand(empty, { type: "add_node", node: apiNode });
    expect(next.nodes).toEqual([apiNode]);
  });

  it("does not mutate the input nodes array", () => {
    applyCommand(empty, { type: "add_node", node: apiNode });
    expect(empty.nodes).toEqual([]);
  });

  it("rejects a duplicate id", () => {
    const once = applyCommand(empty, { type: "add_node", node: apiNode });
    expect(() =>
      applyCommand(once, { type: "add_node", node: apiNode }),
    ).toThrow(CommandError);
  });

  it("rejects an invalid id (caught by schema)", () => {
    expect(() =>
      applyCommand(empty, {
        type: "add_node",
        node: { id: "Bad", kind: "service", name: "X" },
      }),
    ).toThrow();
  });

  it("rejects when parentId does not reference an existing node", () => {
    expect(() =>
      applyCommand(empty, {
        type: "add_node",
        node: {
          id: "api",
          kind: "service",
          name: "API",
          parentId: "missing",
        },
      }),
    ).toThrow(CommandError);
  });

  it("accepts a valid parentId", () => {
    const withParent = applyCommand(empty, {
      type: "add_node",
      node: { id: "platform", kind: "custom", name: "Platform" },
    });
    const next = applyCommand(withParent, {
      type: "add_node",
      node: {
        id: "api",
        kind: "service",
        name: "API",
        parentId: "platform",
      },
    });
    expect(next.nodes).toHaveLength(2);
  });
});

describe("applyCommand: remove_node", () => {
  it("removes the node", () => {
    const next = applyCommand(withTwoNodes, {
      type: "remove_node",
      id: "db",
    });
    expect(next.nodes.map((n) => n.id)).toEqual(["api"]);
  });

  it("cascade-deletes incident edges (both directions)", () => {
    const next = applyCommand(withTwoNodes, {
      type: "remove_node",
      id: "db",
    });
    expect(next.edges).toEqual([]);
  });

  it("does not mutate the input", () => {
    applyCommand(withTwoNodes, { type: "remove_node", id: "db" });
    expect(withTwoNodes.nodes).toHaveLength(2);
    expect(withTwoNodes.edges).toHaveLength(1);
  });

  it("rejects a missing id", () => {
    expect(() =>
      applyCommand(empty, { type: "remove_node", id: "missing" }),
    ).toThrow(CommandError);
  });

  it("rejects removal when the node is a parent of another node", () => {
    const withParent: Document = {
      version: "1.0",
      name: "X",
      nodes: [
        { id: "platform", kind: "custom", name: "Platform" },
        {
          id: "api",
          kind: "service",
          name: "API",
          parentId: "platform",
        },
      ],
      edges: [],
    };
    expect(() =>
      applyCommand(withParent, { type: "remove_node", id: "platform" }),
    ).toThrow(CommandError);
  });
});

describe("applyCommand: update_node", () => {
  it("applies a partial patch", () => {
    const next = applyCommand(withTwoNodes, {
      type: "update_node",
      id: "api",
      patch: { name: "Renamed API", stack: "Go 1.23" },
    });
    const api = next.nodes.find((n) => n.id === "api");
    expect(api?.name).toBe("Renamed API");
    expect(api?.stack).toBe("Go 1.23");
  });

  it("preserves untouched fields", () => {
    const next = applyCommand(withTwoNodes, {
      type: "update_node",
      id: "api",
      patch: { name: "Renamed API" },
    });
    const api = next.nodes.find((n) => n.id === "api");
    expect(api?.kind).toBe("service");
    expect(api?.id).toBe("api");
  });

  it("does not mutate the input", () => {
    applyCommand(withTwoNodes, {
      type: "update_node",
      id: "api",
      patch: { name: "X" },
    });
    expect(withTwoNodes.nodes[0]?.name).toBe("API");
  });

  it("rejects updates to a missing node", () => {
    expect(() =>
      applyCommand(empty, {
        type: "update_node",
        id: "missing",
        patch: { name: "X" },
      }),
    ).toThrow(CommandError);
  });

  it("rejects a patch that changes the id", () => {
    expect(() =>
      applyCommand(withTwoNodes, {
        type: "update_node",
        id: "api",
        patch: { id: "renamed" },
      }),
    ).toThrow(CommandError);
  });

  it("rejects a parentId that does not exist", () => {
    expect(() =>
      applyCommand(withTwoNodes, {
        type: "update_node",
        id: "api",
        patch: { parentId: "missing" },
      }),
    ).toThrow(CommandError);
  });

  it("rejects a parentId that creates a self-cycle", () => {
    expect(() =>
      applyCommand(withTwoNodes, {
        type: "update_node",
        id: "api",
        patch: { parentId: "api" },
      }),
    ).toThrow(CommandError);
  });
});

describe("applyCommand: connect", () => {
  const e = {
    id: "api-db-2",
    from: "api",
    to: "db",
    relationship: "reads",
  } as const;

  it("appends the edge", () => {
    const next = applyCommand(withTwoNodes, { type: "connect", edge: e });
    expect(next.edges.map((x) => x.id)).toEqual(["api-db", "api-db-2"]);
  });

  it("rejects a duplicate edge id", () => {
    expect(() =>
      applyCommand(withTwoNodes, {
        type: "connect",
        edge: { ...e, id: "api-db" },
      }),
    ).toThrow(CommandError);
  });

  it("rejects an edge whose from does not exist", () => {
    expect(() =>
      applyCommand(withTwoNodes, {
        type: "connect",
        edge: { ...e, from: "ghost" },
      }),
    ).toThrow(CommandError);
  });

  it("rejects an edge whose to does not exist", () => {
    expect(() =>
      applyCommand(withTwoNodes, {
        type: "connect",
        edge: { ...e, to: "ghost" },
      }),
    ).toThrow(CommandError);
  });
});

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

describe("applyCommand: never mutates the input", () => {
  it.each([
    ["rename_document", { type: "rename_document", name: "Z" }],
    ["add_node", { type: "add_node", node: { id: "x", kind: "service", name: "X" } }],
    ["remove_node", { type: "remove_node", id: "db" }],
    [
      "update_node",
      { type: "update_node", id: "api", patch: { name: "X" } },
    ],
    [
      "connect",
      {
        type: "connect",
        edge: { id: "e2", from: "api", to: "db", relationship: "reads" },
      },
    ],
    ["disconnect", { type: "disconnect", id: "api-db" }],
  ] as const)("%s does not throw on a deep-frozen document", (_, cmd) => {
    const frozen = deepFreeze(structuredClone(withTwoNodes));
    expect(() => applyCommand(frozen, cmd)).not.toThrow();
  });
});

describe("applyCommand: result always re-validates", () => {
  it("rejects a patch that produces a kind not in the taxonomy", () => {
    expect(() =>
      applyCommand(withTwoNodes, {
        type: "update_node",
        id: "api",
        // @ts-expect-error -- intentionally invalid kind to test the
        // post-reduce schema validation safety net.
        patch: { kind: "loadbalancer" },
      }),
    ).toThrow();
  });
});

describe("applyCommand: disconnect", () => {
  it("removes the edge", () => {
    const next = applyCommand(withTwoNodes, {
      type: "disconnect",
      id: "api-db",
    });
    expect(next.edges).toEqual([]);
  });

  it("does not mutate the input", () => {
    applyCommand(withTwoNodes, { type: "disconnect", id: "api-db" });
    expect(withTwoNodes.edges).toHaveLength(1);
  });

  it("rejects a missing edge id", () => {
    expect(() =>
      applyCommand(withTwoNodes, { type: "disconnect", id: "missing" }),
    ).toThrow(CommandError);
  });
});
