import { describe, it, expect } from "vitest";
import {
  checkCrossFileReferences,
  checkSourcePaths,
  validateDocument,
  formatErrors,
} from "./validate.ts";
import type { Document } from "./types.ts";

const validDoc = {
  version: "1.0",
  name: "Demo",
  nodes: [{ id: "api", kind: "service", name: "API" }],
  edges: [],
};

describe("validateDocument", () => {
  it("returns ok=true with the parsed document on success", () => {
    const result = validateDocument(validDoc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Demo");
      expect(result.value.nodes).toHaveLength(1);
    }
  });

  it("returns ok=false with errors on failure", () => {
    const result = validateDocument({ ...validDoc, version: "2.0" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("includes the field path in error messages", () => {
    const result = validateDocument({
      ...validDoc,
      nodes: [{ id: "BadId", kind: "service", name: "X" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.errors.map((e) => e.path);
      expect(paths.some((p) => p.includes("nodes") && p.includes("id"))).toBe(
        true,
      );
    }
  });

  it("reports multiple errors at once", () => {
    const result = validateDocument({
      version: "1.0",
      name: "Demo",
      nodes: [
        { id: "BadId", kind: "service", name: "X" },
        { id: "ok", kind: "not-a-kind", name: "Y" },
      ],
      edges: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("reports unknown keys with a clear path", () => {
    const result = validateDocument({
      ...validDoc,
      viewport: { x: 0, y: 0 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path.includes("viewport"))).toBe(true);
    }
  });

  it("appends an array hint when `notes` is a single string", () => {
    // Most common Claude mistake on first-attempt YAML — wrap the
    // single string and produce a teaching hint that names the
    // schema CLI for the full picture.
    const result = validateDocument({
      ...validDoc,
      nodes: [
        {
          id: "api",
          kind: "service",
          name: "API",
          notes: "single string instead of array",
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === "nodes.0.notes");
      expect(err).toBeDefined();
      expect(err?.message).toMatch(/expected array/i);
      expect(err?.message).toContain("hint:");
      expect(err?.message).toContain("notes is an array");
      expect(err?.message).toContain("npx archik schema");
    }
  });

  it("appends an edge.id hint when an edge omits its id", () => {
    // The other canonical first-attempt mistake — Claude forgets
    // `id` on edges. The hint points at the schema CLI.
    const result = validateDocument({
      ...validDoc,
      nodes: [
        { id: "a", kind: "service", name: "A" },
        { id: "b", kind: "service", name: "B" },
      ],
      edges: [{ from: "a", to: "b", relationship: "writes" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === "edges.0.id");
      expect(err).toBeDefined();
      expect(err?.message).toContain("hint:");
      expect(err?.message).toContain("every edge requires an `id`");
      expect(err?.message).toContain("npx archik schema");
    }
  });
});

describe("checkCrossFileReferences", () => {
  const baseDoc: Document = {
    version: "1.0",
    name: "Demo",
    nodes: [
      {
        id: "agent",
        kind: "agent",
        name: "Agent",
        archikFile: ".archik/agent-loop.archik.yaml",
      },
      {
        id: "api",
        kind: "service",
        name: "API",
      },
    ],
    edges: [
      {
        id: "api-to-agent",
        from: "api",
        to: "agent",
        relationship: "invokes",
      },
      {
        id: "api-payments",
        from: "api",
        to: "charge",
        toFile: ".archik/payments.archik.yaml",
        relationship: "http_call",
      },
    ],
  };

  it("returns no errors when every cross-file path exists", () => {
    const present = new Set([
      ".archik/agent-loop.archik.yaml",
      ".archik/payments.archik.yaml",
    ]);
    const errors = checkCrossFileReferences(baseDoc, (rel) => present.has(rel));
    expect(errors).toEqual([]);
  });

  it("flags a missing archikFile (e.g. typed without the .archik/ prefix)", () => {
    const broken: Document = {
      ...baseDoc,
      nodes: [
        {
          id: "agent",
          kind: "agent",
          name: "Agent",
          archikFile: "agent-loop.archik.yaml", // missing `.archik/`
        },
      ],
      edges: [],
    };
    const errors = checkCrossFileReferences(broken, () => false);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe("nodes.0.archikFile");
    expect(errors[0]!.message).toMatch(/agent-loop\.archik\.yaml/);
    expect(errors[0]!.message).toMatch(/does not exist/);
  });

  it("flags a missing toFile on a cross-file edge", () => {
    const errors = checkCrossFileReferences(
      baseDoc,
      (rel) => rel === ".archik/agent-loop.archik.yaml",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe("edges.1.toFile");
  });

  it("flags a missing fromFile", () => {
    const doc: Document = {
      ...baseDoc,
      nodes: [{ id: "api", kind: "service", name: "API" }],
      edges: [
        {
          id: "ext-api",
          from: "external",
          to: "api",
          fromFile: ".archik/external.archik.yaml",
          relationship: "http_call",
        },
      ],
    };
    const errors = checkCrossFileReferences(doc, () => false);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe("edges.0.fromFile");
  });

  it("ignores nodes / edges without cross-file references", () => {
    const doc: Document = {
      version: "1.0",
      name: "Demo",
      nodes: [{ id: "api", kind: "service", name: "API" }],
      edges: [],
    };
    const errors = checkCrossFileReferences(doc, () => false);
    expect(errors).toEqual([]);
  });
});

describe("checkSourcePaths", () => {
  // A node fixture for each "shape" we care about: code-bearing
  // with valid path, code-bearing with no path, code-bearing with
  // a path that doesn't exist, and a non-code-bearing kind.
  const docWithMixedNodes: Document = {
    version: "1.0",
    name: "Demo",
    nodes: [
      {
        id: "good-service",
        kind: "service",
        name: "Good",
        sourcePath: "src/good",
      },
      {
        id: "missing-path",
        kind: "function",
        name: "Missing",
      },
      {
        id: "bad-path",
        kind: "module",
        name: "Bad",
        sourcePath: "src/does-not-exist",
      },
      {
        // Non-code-bearing kinds are exempt — sourcePath isn't even
        // expected for an external service.
        id: "stripe",
        kind: "external",
        name: "Stripe",
      },
    ],
    edges: [],
  };

  const onDisk = new Set(["src/good"]);
  const exists = (p: string): boolean => onDisk.has(p);

  it("returns no errors for a discussion file (sourcePath rules are relaxed)", () => {
    const errors = checkSourcePaths(docWithMixedNodes, "discussion", exists);
    expect(errors).toEqual([]);
  });

  it("flags missing sourcePath on a code-bearing node in normal mode", () => {
    const errors = checkSourcePaths(docWithMixedNodes, "normal", exists);
    const missing = errors.find(
      (e) => e.path === "nodes.1.sourcePath" && /missing required/.test(e.message),
    );
    expect(missing).toBeDefined();
    expect(missing?.message).toContain("missing-path");
    expect(missing?.message).toContain("function");
    // Hint pointing the agent at discussion mode.
    expect(missing?.message).toContain("discussion.yaml");
  });

  it("flags an on-disk-missing sourcePath in normal mode", () => {
    const errors = checkSourcePaths(docWithMixedNodes, "normal", exists);
    const dangling = errors.find((e) => e.path === "nodes.2.sourcePath");
    expect(dangling).toBeDefined();
    expect(dangling?.message).toMatch(/does not exist on disk/);
    expect(dangling?.message).toContain("src/does-not-exist");
  });

  it("does not flag non-code-bearing kinds even when sourcePath is absent", () => {
    const errors = checkSourcePaths(docWithMixedNodes, "normal", exists);
    expect(errors.find((e) => e.path === "nodes.3.sourcePath")).toBeUndefined();
  });

  it("applies the same strict rules to a suggested file (it'll become normal on accept)", () => {
    const errors = checkSourcePaths(docWithMixedNodes, "suggested", exists);
    expect(errors.length).toBeGreaterThanOrEqual(2); // missing + bad path
  });

  it("returns no errors when every code-bearing node has a valid existing path", () => {
    const cleanDoc: Document = {
      version: "1.0",
      name: "Demo",
      nodes: [
        {
          id: "svc",
          kind: "service",
          name: "Svc",
          sourcePath: "src/good",
        },
      ],
      edges: [],
    };
    expect(checkSourcePaths(cleanDoc, "normal", exists)).toEqual([]);
  });

  it("exempts a proposed code-bearing node from the required-sourcePath rule", () => {
    // status:proposed is the established 'code doesn't exist yet'
    // signal — drift already skips it; validation must too, otherwise
    // you can't have a planned node in a normal file.
    const proposedDoc: Document = {
      version: "1.0",
      name: "Demo",
      nodes: [
        {
          id: "payments",
          kind: "service",
          name: "Payments",
          status: "proposed",
        },
      ],
      edges: [],
    };
    expect(checkSourcePaths(proposedDoc, "normal", exists)).toEqual([]);
  });

  it("still rejects a proposed node whose declared sourcePath doesn't resolve", () => {
    // Once a path is declared, even a proposed node has to keep it
    // honest — otherwise typos / refactor stragglers slip through
    // silently.
    const stalePathDoc: Document = {
      version: "1.0",
      name: "Demo",
      nodes: [
        {
          id: "payments",
          kind: "service",
          name: "Payments",
          status: "proposed",
          sourcePath: "src/typo",
        },
      ],
      edges: [],
    };
    const errors = checkSourcePaths(stalePathDoc, "normal", exists);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe("nodes.0.sourcePath");
    expect(errors[0]!.message).toMatch(/does not exist on disk/);
  });

  it("exempts deprecated nodes too — they may already be gone", () => {
    const deprecatedDoc: Document = {
      version: "1.0",
      name: "Demo",
      nodes: [
        {
          id: "legacy",
          kind: "module",
          name: "Legacy",
          status: "deprecated",
        },
      ],
      edges: [],
    };
    expect(checkSourcePaths(deprecatedDoc, "normal", exists)).toEqual([]);
  });

  it("hint on missing sourcePath mentions both proposed and discussion as escape valves", () => {
    const doc: Document = {
      version: "1.0",
      name: "Demo",
      nodes: [{ id: "svc", kind: "service", name: "Svc" }],
      edges: [],
    };
    const errors = checkSourcePaths(doc, "normal", exists);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("status: proposed");
    expect(errors[0]!.message).toContain("discussion.yaml");
  });

  describe("parent / child sourcePath containment", () => {
    // Parent's sourcePath is a directory. Same fixture, different
    // child paths per test.
    const present = new Set([
      "src/orders",
      "src/orders/api",
      "src/payments/api",
    ]);
    const exists = (p: string): boolean => present.has(p);

    const docWith = (
      childPath: string,
      parentPath = "src/orders",
    ): Document => ({
      version: "1.0",
      name: "Demo",
      nodes: [
        {
          id: "orders",
          kind: "module",
          name: "Orders",
          sourcePath: parentPath,
        },
        {
          id: "orders-api",
          kind: "function",
          name: "API",
          parentId: "orders",
          sourcePath: childPath,
        },
      ],
      edges: [],
    });

    it("accepts a child sourcePath inside the parent's directory", () => {
      expect(checkSourcePaths(docWith("src/orders/api"), "normal", exists))
        .toEqual([]);
    });

    it("rejects a child sourcePath outside the parent's directory", () => {
      const errors = checkSourcePaths(docWith("src/payments/api"), "normal", exists);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.path).toBe("nodes.1.sourcePath");
      expect(errors[0]!.message).toMatch(/not inside its parent's sourcePath/);
      expect(errors[0]!.message).toContain("src/payments/api");
      expect(errors[0]!.message).toContain("src/orders");
    });

    it("rejects sibling-prefix collisions (segment boundary check)", () => {
      // src/orders does NOT contain src/orders-legacy/api — the
      // shared prefix must end at a / boundary.
      const present2 = new Set(["src/orders", "src/orders-legacy/api"]);
      const errors = checkSourcePaths(
        docWith("src/orders-legacy/api"),
        "normal",
        (p) => present2.has(p),
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toMatch(/not inside/);
    });

    it("skips the check when the parent's sourcePath is a single file (can't contain anything)", () => {
      // Parent canvas is `src/render/Canvas.tsx` — children living
      // anywhere are fine because a file isn't a container.
      const present2 = new Set([
        "src/render/Canvas.tsx",
        "src/ui/Inspector.tsx",
      ]);
      const doc: Document = {
        version: "1.0",
        name: "Demo",
        nodes: [
          {
            id: "canvas",
            kind: "page",
            name: "Canvas",
            sourcePath: "src/render/Canvas.tsx",
          },
          {
            id: "inspector",
            kind: "module",
            name: "Inspector",
            parentId: "canvas",
            sourcePath: "src/ui/Inspector.tsx",
          },
        ],
        edges: [],
      };
      expect(checkSourcePaths(doc, "normal", (p) => present2.has(p))).toEqual([]);
    });

    it("skips the check when the parent has no sourcePath at all", () => {
      // Parent (e.g. kind: external or an interface) has no path —
      // there's no claim to contradict, so the child can live
      // anywhere on disk.
      const present2 = new Set(["src/orders/api"]);
      const doc: Document = {
        version: "1.0",
        name: "Demo",
        nodes: [
          { id: "external-thing", kind: "external", name: "Stripe" },
          {
            id: "child",
            kind: "function",
            name: "Child",
            parentId: "external-thing",
            sourcePath: "src/orders/api",
          },
        ],
        edges: [],
      };
      expect(checkSourcePaths(doc, "normal", (p) => present2.has(p))).toEqual([]);
    });

    it("treats parent path and child path as equal as contained (same node)", () => {
      const present2 = new Set(["src/orders"]);
      const doc: Document = {
        version: "1.0",
        name: "Demo",
        nodes: [
          {
            id: "outer",
            kind: "module",
            name: "Outer",
            sourcePath: "src/orders",
          },
          {
            id: "inner",
            kind: "module",
            name: "Inner",
            parentId: "outer",
            sourcePath: "src/orders",
          },
        ],
        edges: [],
      };
      expect(checkSourcePaths(doc, "normal", (p) => present2.has(p))).toEqual([]);
    });
  });
});

describe("formatErrors", () => {
  it("renders errors as a single human-readable string", () => {
    const result = validateDocument({
      ...validDoc,
      nodes: [{ id: "Nope", kind: "service", name: "X" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = formatErrors(result.errors);
      expect(text).toMatch(/nodes/);
      expect(text).toMatch(/id/);
    }
  });
});
