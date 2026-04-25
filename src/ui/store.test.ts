import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore, focusedSelection } from "./store.ts";

describe("useUIStore (selection)", () => {
  beforeEach(() => {
    useUIStore.getState().clearSelection();
    useUIStore.getState().cancelConnect();
  });

  it("starts with no selection", () => {
    expect(useUIStore.getState().selection).toEqual([]);
  });

  it("selectNode replaces the selection with a single node entry", () => {
    useUIStore.getState().selectNode("api");
    useUIStore.getState().selectNode("db");
    expect(useUIStore.getState().selection).toEqual([
      { type: "node", id: "db" },
    ]);
  });

  it("selectEdge replaces the selection with a single edge entry", () => {
    useUIStore.getState().selectEdge("api-db");
    expect(useUIStore.getState().selection).toEqual([
      { type: "edge", id: "api-db" },
    ]);
  });

  it("toggleNode adds when missing and removes when present", () => {
    useUIStore.getState().toggleNode("api");
    expect(useUIStore.getState().selection).toHaveLength(1);
    useUIStore.getState().toggleNode("db");
    expect(useUIStore.getState().selection).toHaveLength(2);
    useUIStore.getState().toggleNode("api");
    expect(useUIStore.getState().selection).toEqual([
      { type: "node", id: "db" },
    ]);
  });

  it("toggleEdge works the same way for edges", () => {
    useUIStore.getState().toggleEdge("e1");
    useUIStore.getState().toggleEdge("e2");
    useUIStore.getState().toggleEdge("e1");
    expect(useUIStore.getState().selection).toEqual([
      { type: "edge", id: "e2" },
    ]);
  });

  it("clearSelection empties the array", () => {
    useUIStore.getState().toggleNode("a");
    useUIStore.getState().toggleNode("b");
    useUIStore.getState().clearSelection();
    expect(useUIStore.getState().selection).toEqual([]);
  });

  it("startConnect records the from node and clears selection", () => {
    useUIStore.getState().selectNode("api");
    useUIStore.getState().startConnect("api");
    expect(useUIStore.getState().connectFrom).toBe("api");
    expect(useUIStore.getState().selection).toEqual([]);
  });

  it("cancelConnect clears connectFrom", () => {
    useUIStore.getState().startConnect("api");
    useUIStore.getState().cancelConnect();
    expect(useUIStore.getState().connectFrom).toBeNull();
  });

  it("focusedSelection returns the last added item or null when empty", () => {
    useUIStore.getState().toggleNode("api");
    useUIStore.getState().toggleNode("db");
    expect(focusedSelection(useUIStore.getState().selection)).toEqual({
      type: "node",
      id: "db",
    });
    useUIStore.getState().clearSelection();
    expect(focusedSelection(useUIStore.getState().selection)).toBeNull();
  });
});
