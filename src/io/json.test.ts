import { describe, it, expect } from "vitest";
import { parseJson, stringifyJson } from "./json.ts";
import { ordersDocument } from "../domain/__fixtures__/orders.ts";

describe("parseJson", () => {
  it("parses a valid document", () => {
    const text = JSON.stringify({
      version: "1.0",
      name: "Demo",
      nodes: [{ id: "api", kind: "service", name: "API", description: "test fixture" }],
      edges: [],
    });
    const doc = parseJson(text);
    expect(doc.name).toBe("Demo");
  });

  it("throws on malformed JSON", () => {
    expect(() => parseJson("{not json")).toThrow(/json/i);
  });

  it("throws when the parsed object is not a valid Archik document", () => {
    expect(() => parseJson("{}")).toThrow(/version/i);
  });
});

describe("stringifyJson", () => {
  it("round-trips the orders fixture", () => {
    const json = stringifyJson(ordersDocument);
    expect(parseJson(json)).toEqual(ordersDocument);
  });

  it("emits stable, indented output", () => {
    const json = stringifyJson(ordersDocument);
    expect(json).toMatch(/\n  "version"/);
  });
});
