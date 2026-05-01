import { describe, it, expect } from "vitest";
import { parseYaml, stringifyYaml } from "./yaml.ts";
import { ordersDocument } from "../domain/__fixtures__/orders.ts";

const minimalYaml = `version: "1.0"
name: Demo
nodes:
  - id: api
    kind: service
    name: API
    description: test fixture
edges: []
`;

describe("parseYaml", () => {
  it("parses a minimal valid document", () => {
    const doc = parseYaml(minimalYaml);
    expect(doc.name).toBe("Demo");
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0]?.id).toBe("api");
  });

  it("throws on malformed YAML", () => {
    expect(() => parseYaml("name: Demo\nnodes: [unbalanced")).toThrow(
      /yaml/i,
    );
  });

  it("throws when the parsed object is not a valid Archik document", () => {
    expect(() =>
      parseYaml(`version: "1.0"\nname: Demo\nnodes: []\n`),
    ).toThrow(/edges/i);
  });

  it("surfaces unrecognized keys in the error (e.g., x/y coordinates)", () => {
    expect(() =>
      parseYaml(`version: "1.0"
name: Demo
nodes:
  - id: api
    kind: service
    name: API
    description: test fixture
    x: 100
edges: []
`),
    ).toThrow(/unrecognized/i);
  });
});

describe("stringifyYaml", () => {
  it("round-trips the orders fixture", () => {
    const yaml = stringifyYaml(ordersDocument);
    const parsed = parseYaml(yaml);
    expect(parsed).toEqual(ordersDocument);
  });

  it("emits a stable shape (top-level keys present)", () => {
    const yaml = stringifyYaml(ordersDocument);
    expect(yaml).toMatch(/^version:/m);
    expect(yaml).toMatch(/^name:/m);
    expect(yaml).toMatch(/^nodes:/m);
    expect(yaml).toMatch(/^edges:/m);
  });
});
