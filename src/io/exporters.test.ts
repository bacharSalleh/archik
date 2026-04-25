import { describe, it, expect } from "vitest";
import { exporters, getExporter } from "./exporters.ts";
import { ordersDocument } from "../domain/__fixtures__/orders.ts";

describe("exporter registry", () => {
  it("registers yaml, json, and markdown by name", () => {
    expect(exporters.map((e) => e.name).sort()).toEqual([
      "json",
      "markdown",
      "yaml",
    ]);
  });

  it("each exporter has a label, extension, and mime type", () => {
    for (const e of exporters) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.extension.startsWith(".")).toBe(true);
      expect(e.mime).toMatch(/\//);
    }
  });

  it("each exporter produces a non-empty string for the orders fixture", () => {
    for (const e of exporters) {
      const out = e.export(ordersDocument);
      expect(out.length).toBeGreaterThan(0);
    }
  });

  it("getExporter('json') returns the json exporter", () => {
    expect(getExporter("json").name).toBe("json");
  });

  it("getExporter throws for an unknown name", () => {
    expect(() => getExporter("foo")).toThrow(/exporter/i);
  });

  it("yaml exporter round-trips through parseYaml", async () => {
    const { parseYaml } = await import("./yaml.ts");
    const yaml = getExporter("yaml").export(ordersDocument);
    expect(parseYaml(yaml)).toEqual(ordersDocument);
  });
});
