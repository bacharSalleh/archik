import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectDrift } from "./detector.ts";
import { parseDriftignore } from "./driftignore.ts";
import type { Document } from "../domain/types.ts";

function makeDoc(
  nodes: Partial<{ id: string; kind: string; name: string; sourcePath: string; status: string }>[],
): Document {
  return {
    version: "1.0",
    name: "Test",
    nodes: nodes.map((n, i) => ({
      id: n.id ?? `node-${i}`,
      kind: (n.kind ?? "service") as Document["nodes"][0]["kind"],
      name: n.name ?? `Node ${i}`,
      ...(n.sourcePath !== undefined ? { sourcePath: n.sourcePath } : {}),
      ...(n.status !== undefined ? { status: n.status as "proposed" | "active" | "deprecated" } : {}),
    })),
    edges: [],
  };
}

describe("detectDrift", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "archik-drift-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns empty when everything matches", async () => {
    await mkdir(path.join(root, "src", "orders"), { recursive: true });
    const doc = makeDoc([{ id: "orders", sourcePath: "src/orders/" }]);
    const result = await detectDrift(doc, root, []);
    expect(result.orphan).toHaveLength(0);
    expect(result.unmapped).toHaveLength(0);
    expect(result.summary.total).toBe(0);
  });

  it("detects orphan nodes (sourcePath not on disk)", async () => {
    const doc = makeDoc([
      { id: "orders", sourcePath: "src/orders/" },
      { id: "payments", sourcePath: "src/payments/" },
    ]);
    await mkdir(path.join(root, "src", "orders"), { recursive: true });

    const result = await detectDrift(doc, root, []);
    expect(result.orphan).toHaveLength(1);
    expect(result.orphan[0]!.id).toBe("payments");
    expect(result.orphan[0]!.sourcePath).toBe("src/payments/");
    expect(result.summary.orphan).toBe(1);
  });

  it("skips proposed nodes", async () => {
    const doc = makeDoc([
      { id: "payments", sourcePath: "src/payments/", status: "proposed" },
    ]);
    const result = await detectDrift(doc, root, []);
    expect(result.orphan).toHaveLength(0);
  });

  it("skips deprecated nodes", async () => {
    const doc = makeDoc([
      { id: "legacy", sourcePath: "src/legacy/", status: "deprecated" },
    ]);
    const result = await detectDrift(doc, root, []);
    expect(result.orphan).toHaveLength(0);
  });

  it("checks nodes with explicit status: active", async () => {
    await mkdir(path.join(root, "src", "orders"), { recursive: true });
    const doc = makeDoc([
      { id: "orders", sourcePath: "src/orders/", status: "active" },
    ]);
    const result = await detectDrift(doc, root, []);
    expect(result.orphan).toHaveLength(0);
  });

  it("reports orphan when explicit active node path missing", async () => {
    const doc = makeDoc([
      { id: "ghost", sourcePath: "src/ghost/", status: "active" },
    ]);
    const result = await detectDrift(doc, root, []);
    expect(result.orphan).toHaveLength(1);
    expect(result.orphan[0]!.id).toBe("ghost");
  });

  it("skips nodes without sourcePath", async () => {
    const doc = makeDoc([{ id: "external-api" }]);
    const result = await detectDrift(doc, root, []);
    expect(result.orphan).toHaveLength(0);
  });

  it("detects unmapped code directories", async () => {
    await mkdir(path.join(root, "src", "orders"), { recursive: true });
    await mkdir(path.join(root, "src", "notifications"), { recursive: true });

    const doc = makeDoc([{ id: "orders", sourcePath: "src/orders/" }]);
    const result = await detectDrift(doc, root, []);
    expect(result.unmapped).toHaveLength(1);
    expect(result.unmapped[0]!.path).toBe("src/notifications/");
  });

  it("respects driftignore patterns", async () => {
    await mkdir(path.join(root, "src", "orders"), { recursive: true });
    await mkdir(path.join(root, "src", "migrations"), { recursive: true });

    const doc = makeDoc([{ id: "orders", sourcePath: "src/orders/" }]);
    const rules = parseDriftignore("src/migrations/**\n");
    const result = await detectDrift(doc, root, rules);

    expect(result.unmapped).toHaveLength(0);
    expect(result.ignored).toHaveLength(1);
    expect(result.ignored[0]!.path).toBe("src/migrations/");
    expect(result.ignored[0]!.pattern).toBe("src/migrations/**");
  });

  it("scans all source roots (src, services, packages, apps)", async () => {
    await mkdir(path.join(root, "src", "orders"), { recursive: true });
    await mkdir(path.join(root, "services", "auth"), { recursive: true });
    await mkdir(path.join(root, "packages", "ui"), { recursive: true });

    const doc = makeDoc([
      { id: "orders", sourcePath: "src/orders/" },
      { id: "auth", sourcePath: "services/auth/" },
    ]);
    const result = await detectDrift(doc, root, []);
    expect(result.unmapped).toHaveLength(1);
    expect(result.unmapped[0]!.path).toBe("packages/ui/");
  });

  it("considers a directory covered if any sourcePath is inside it", async () => {
    await mkdir(path.join(root, "src", "workers", "payments"), {
      recursive: true,
    });
    await mkdir(path.join(root, "src", "workers", "orders"), {
      recursive: true,
    });

    const doc = makeDoc([
      { id: "payments-worker", sourcePath: "src/workers/payments/" },
      { id: "orders-worker", sourcePath: "src/workers/orders/" },
    ]);
    const result = await detectDrift(doc, root, []);
    // src/workers/ itself is not listed as unmapped because
    // its children are covered.
    expect(result.unmapped).toHaveLength(0);
  });

  it("does not let proposed nodes cover unmapped directories", async () => {
    await mkdir(path.join(root, "src", "notifications"), { recursive: true });
    const doc = makeDoc([
      { id: "notif", sourcePath: "src/notifications/", status: "proposed" },
    ]);
    const result = await detectDrift(doc, root, []);
    expect(result.unmapped).toHaveLength(1);
    expect(result.unmapped[0]!.path).toBe("src/notifications/");
  });

  it("does not let deprecated nodes cover unmapped directories", async () => {
    await mkdir(path.join(root, "src", "legacy"), { recursive: true });
    const doc = makeDoc([
      { id: "legacy", sourcePath: "src/legacy/", status: "deprecated" },
    ]);
    const result = await detectDrift(doc, root, []);
    expect(result.unmapped).toHaveLength(1);
    expect(result.unmapped[0]!.path).toBe("src/legacy/");
  });
});
