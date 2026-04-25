import { describe, it, expect } from "vitest";
import { layout, layoutEngines, defaultLayoutEngine } from "./index.ts";

describe("layout registry", () => {
  it("registers the elk engine by name", () => {
    expect(layoutEngines["elk"]).toBeDefined();
    expect(defaultLayoutEngine.name).toBe("elk");
  });

  it("layout() delegates to the default engine", async () => {
    const out = await layout({
      version: "1.0",
      name: "X",
      nodes: [{ id: "a", kind: "service", name: "A" }],
      edges: [],
    });
    expect(out.roots).toHaveLength(1);
  });
});
