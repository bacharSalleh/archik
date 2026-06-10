import { describe, expect, it } from "vitest";
import { importCompose } from "./compose-import.ts";
import { validateDocument } from "./validate.ts";

const exists = (dirs: string[]) => (rel: string): boolean => dirs.includes(rel);

describe("importCompose", () => {
  it("infers kinds from well-known images", () => {
    const compose = {
      services: {
        db: { image: "postgres:16" },
        cache: { image: "redis:7-alpine" },
        broker: { image: "confluentinc/cp-kafka:7.5.0" },
        proxy: { image: "nginx:1.25" },
        vectors: { image: "qdrant/qdrant" },
      },
    };
    const { doc, issues } = importCompose(compose, "Demo", exists([]));
    expect(issues).toEqual([]);
    const kinds = Object.fromEntries(doc.nodes.map((n) => [n.id, n.kind]));
    expect(kinds).toEqual({
      db: "database",
      cache: "cache",
      broker: "stream",
      proxy: "gateway",
      vectors: "vectordb",
    });
  });

  it("maps a build context that exists on disk to a service with sourcePath", () => {
    const compose = {
      services: {
        api: { build: "./services/api" },
        worker: { build: { context: "services/worker" } },
      },
    };
    const { doc } = importCompose(
      compose,
      "Demo",
      exists(["services/api", "services/worker"]),
    );
    expect(doc.nodes[0]).toMatchObject({
      id: "api",
      kind: "service",
      sourcePath: "services/api",
    });
    expect(doc.nodes[1]).toMatchObject({
      id: "worker",
      kind: "service",
      sourcePath: "services/worker",
    });
  });

  it("falls back to external when the build context is missing on disk", () => {
    const compose = { services: { api: { build: "./gone" } } };
    const { doc, issues } = importCompose(compose, "Demo", exists([]));
    expect(doc.nodes[0]!.kind).toBe("external");
    expect(doc.nodes[0]!.sourcePath).toBeUndefined();
    expect(issues[0]!.message).toContain("not found on disk");
  });

  it("creates depends_on edges for list and map forms", () => {
    const compose = {
      services: {
        api: { build: "./api", depends_on: ["db"] },
        worker: { build: "./worker", depends_on: { db: { condition: "service_healthy" } } },
        db: { image: "postgres" },
      },
    };
    const { doc } = importCompose(compose, "Demo", exists(["api", "worker"]));
    expect(doc.edges).toHaveLength(2);
    expect(doc.edges[0]).toMatchObject({
      from: "api",
      to: "db",
      relationship: "depends_on",
    });
    expect(doc.edges[1]).toMatchObject({ from: "worker", to: "db" });
  });

  it("skips depends_on that reference unknown services, with a warning", () => {
    const compose = {
      services: { api: { image: "nginx", depends_on: ["ghost"] } },
    };
    const { doc, issues } = importCompose(compose, "Demo", exists([]));
    expect(doc.edges).toEqual([]);
    expect(issues[0]!.message).toContain('"ghost"');
  });

  it("skips the second service when sanitisation collapses two names onto one id", () => {
    const compose = {
      services: { "my-app": { image: "nginx" }, "My_App": { image: "nginx" } },
    };
    const { doc, issues } = importCompose(compose, "Demo", exists([]));
    expect(doc.nodes).toHaveLength(1);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('"my-app"');
  });

  it("sanitises service names into valid ids", () => {
    const compose = {
      services: { "My_App.web": { image: "nginx" }, "2nd-svc": { image: "nginx" } },
    };
    const { doc } = importCompose(compose, "Demo", exists([]));
    expect(doc.nodes.map((n) => n.id)).toEqual(["my-app-web", "svc-2nd-svc"]);
  });

  it("produces a document that passes schema validation", () => {
    const compose = {
      services: {
        api: { build: "./api", depends_on: ["db", "cache"] },
        db: { image: "postgres" },
        cache: { image: "redis" },
      },
    };
    const { doc } = importCompose(compose, "Demo", exists(["api"]));
    const result = validateDocument(doc);
    expect(result.ok).toBe(true);
  });

  it("handles an empty or service-less compose file", () => {
    expect(importCompose({}, "Demo", exists([])).doc.nodes).toEqual([]);
    expect(importCompose(null, "Demo", exists([])).doc.nodes).toEqual([]);
  });
});
