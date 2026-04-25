import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "./store.ts";

describe("useUIStore (selection)", () => {
  beforeEach(() => {
    useUIStore.getState().clearSelection();
    useUIStore.getState().cancelConnect();
  });

  it("starts with no selection", () => {
    expect(useUIStore.getState().selection).toBeNull();
  });

  it("selectNode sets a node selection", () => {
    useUIStore.getState().selectNode("api");
    expect(useUIStore.getState().selection).toEqual({
      type: "node",
      id: "api",
    });
  });

  it("selectEdge sets an edge selection", () => {
    useUIStore.getState().selectEdge("api-db");
    expect(useUIStore.getState().selection).toEqual({
      type: "edge",
      id: "api-db",
    });
  });

  it("clearSelection resets to null", () => {
    useUIStore.getState().selectNode("api");
    useUIStore.getState().clearSelection();
    expect(useUIStore.getState().selection).toBeNull();
  });

  it("selectNode replaces an existing edge selection", () => {
    useUIStore.getState().selectEdge("api-db");
    useUIStore.getState().selectNode("api");
    expect(useUIStore.getState().selection).toEqual({
      type: "node",
      id: "api",
    });
  });

  it("startConnect records the from node and clears selection", () => {
    useUIStore.getState().selectNode("api");
    useUIStore.getState().startConnect("api");
    expect(useUIStore.getState().connectFrom).toBe("api");
    expect(useUIStore.getState().selection).toBeNull();
  });

  it("cancelConnect clears connectFrom", () => {
    useUIStore.getState().startConnect("api");
    useUIStore.getState().cancelConnect();
    expect(useUIStore.getState().connectFrom).toBeNull();
  });
});
