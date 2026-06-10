import { describe, expect, it } from "vitest";
import { importMermaid } from "./mermaid-import.ts";
import { validateDocument } from "./validate.ts";

describe("importMermaid", () => {
  it("parses nodes, labels, and shape-based kinds", () => {
    const src = [
      "flowchart TD",
      "  api[Orders API] --> db[(Postgres)]",
      "  api --> ext((Stripe))",
    ].join("\n");
    const { doc, issues } = importMermaid(src, "Demo");
    expect(issues).toEqual([]);
    const byId = Object.fromEntries(doc.nodes.map((n) => [n.id, n]));
    expect(byId["api"]).toMatchObject({ kind: "custom", name: "Orders API" });
    expect(byId["db"]).toMatchObject({ kind: "database", name: "Postgres" });
    expect(byId["ext"]).toMatchObject({ kind: "external", name: "Stripe" });
    expect(doc.edges).toHaveLength(2);
  });

  it("supports edge labels and chains", () => {
    const src = [
      "graph LR",
      "  a -->|emits| b --> c",
    ].join("\n");
    const { doc } = importMermaid(src, "Demo");
    expect(doc.edges).toHaveLength(2);
    expect(doc.edges[0]).toMatchObject({ from: "a", to: "b", label: "emits" });
    expect(doc.edges[1]).toMatchObject({ from: "b", to: "c" });
    expect(doc.edges[1]!.label).toBeUndefined();
  });

  it("maps subgraphs to module parents", () => {
    const src = [
      "flowchart TD",
      "  subgraph billing [Billing]",
      "    charge --> ledger",
      "  end",
      "  api --> charge",
    ].join("\n");
    const { doc } = importMermaid(src, "Demo");
    const byId = Object.fromEntries(doc.nodes.map((n) => [n.id, n]));
    expect(byId["billing"]).toMatchObject({ kind: "module", name: "Billing" });
    expect(byId["charge"]!.parentId).toBe("billing");
    expect(byId["ledger"]!.parentId).toBe("billing");
    expect(byId["api"]!.parentId).toBeUndefined();
  });

  it("drops subgraph→member edges that the schema would reject", () => {
    const src = [
      "flowchart TD",
      "  subgraph billing",
      "    charge",
      "  end",
      "  billing --> charge",
    ].join("\n");
    const { doc, issues } = importMermaid(src, "Demo");
    expect(doc.edges).toHaveLength(0);
    expect(issues.some((i) => i.message.includes("containment"))).toBe(true);
  });

  it("refines a bare reference when the shaped definition comes later", () => {
    const src = [
      "flowchart TD",
      "  api --> db",
      "  db[(Orders DB)]",
    ].join("\n");
    const { doc } = importMermaid(src, "Demo");
    const db = doc.nodes.find((n) => n.id === "db")!;
    expect(db.name).toBe("Orders DB");
    expect(db.kind).toBe("database");
  });

  it("extracts the diagram from a fenced markdown block", () => {
    const src = [
      "# Architecture",
      "",
      "```mermaid",
      "flowchart TD",
      "  a --> b",
      "```",
      "",
      "prose after",
    ].join("\n");
    const { doc } = importMermaid(src, "Demo");
    expect(doc.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });

  it("skips unsupported syntax with warnings instead of failing", () => {
    const src = [
      "flowchart TD",
      "  classDef red fill:#f00",
      "  a & b --> c",
      "  a --> b",
    ].join("\n");
    const { doc, issues } = importMermaid(src, "Demo");
    expect(doc.edges).toHaveLength(1);
    expect(issues.some((i) => i.message.includes("&"))).toBe(true);
  });

  it("sanitises CamelCase ids and produces a valid document", () => {
    const src = [
      "flowchart TD",
      "  OrdersApi[Orders API] --> PaymentsDb[(Payments)]",
    ].join("\n");
    const { doc } = importMermaid(src, "Demo");
    expect(doc.nodes.map((n) => n.id).sort()).toEqual(["ordersapi", "paymentsdb"]);
    expect(validateDocument(doc).ok).toBe(true);
  });

  it("flags non-flowchart input", () => {
    const { doc, issues } = importMermaid("sequenceDiagram\n  A->>B: hi", "Demo");
    expect(doc.nodes).toHaveLength(0);
    expect(issues.length).toBeGreaterThan(0);
  });
});
