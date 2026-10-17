import { describe, expect, it } from "vitest";
import { buildAffectedReport } from "./affected.ts";
import type { LoadedDoc } from "../io/discovery.ts";
import type { Document } from "./types.ts";

const arch: Document = {
  version: "1.0",
  name: "Demo",
  nodes: [
    {
      id: "api",
      kind: "service",
      name: "API",
      description: "x",
      sourcePath: "src/api",
    },
    {
      id: "worker",
      kind: "worker",
      name: "Worker",
      description: "x",
      sourcePath: "src/worker",
    },
    { id: "web", kind: "frontend", name: "Web", description: "x" },
    { id: "db", kind: "database", name: "DB", description: "x" },
  ],
  edges: [
    { id: "web-api", from: "web", to: "api", relationship: "invokes" },
    { id: "worker-api", from: "worker", to: "api", relationship: "invokes" },
    { id: "api-db", from: "api", to: "db", relationship: "writes" },
  ],
};

const archDocs: LoadedDoc[] = [
  { abs: "/p/.archik/main.archik.yaml", relPath: ".archik/main.archik.yaml", doc: arch },
];

describe("buildAffectedReport", () => {
  it("maps a changed file under a node sourcePath to that node", () => {
    const report = buildAffectedReport(["src/api/routes.ts"], archDocs);
    expect(report.nodes).toHaveLength(1);
    expect(report.nodes[0]!.id).toBe("api");
    expect(report.nodes[0]!.files).toEqual(["src/api/routes.ts"]);
    expect(report.unmapped).toEqual([]);
  });

  it("does not match sibling directories with a shared prefix", () => {
    const report = buildAffectedReport(["src/api-legacy/x.ts"], archDocs);
    expect(report.nodes).toHaveLength(0);
    expect(report.unmapped).toEqual(["src/api-legacy/x.ts"]);
  });

  it("lists nodes with an edge into an affected node as dependents", () => {
    const report = buildAffectedReport(["src/api/routes.ts"], archDocs);
    expect(report.dependents.map((d) => d.id).sort()).toEqual(["web", "worker"]);
    expect(report.dependents.find((d) => d.id === "web")!.dependsOn).toEqual(["api"]);
  });

  it("does not list an affected node as its own dependent", () => {
    const report = buildAffectedReport(["src/api/a.ts", "src/worker/b.ts"], archDocs);
    expect(report.dependents.map((d) => d.id)).toEqual(["web"]);
  });

  it("classifies archik model files separately from unmapped code", () => {
    const report = buildAffectedReport(
      [".archik/main.archik.yaml", "docs/readme.md"],
      archDocs,
    );
    expect(report.modelFiles).toEqual([".archik/main.archik.yaml"]);
    expect(report.unmapped).toEqual(["docs/readme.md"]);
  });

  it("normalises ./ prefixes and backslashes", () => {
    const report = buildAffectedReport(["./src\\api\\routes.ts"], archDocs);
    expect(report.nodes).toHaveLength(1);
    expect(report.nodes[0]!.id).toBe("api");
  });

  it("summarises counts", () => {
    const report = buildAffectedReport(
      ["src/api/a.ts", "src/worker/b.ts", "other.txt"],
      archDocs,
    );
    expect(report.summary).toEqual({
      changedFiles: 3,
      nodes: 2,
      dependents: 1,
      unmapped: 1,
    });
  });
});
