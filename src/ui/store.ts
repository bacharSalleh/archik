import { create } from "zustand";

export type Selection =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | null;

export type UIState = {
  selection: Selection;
  selectNode: (id: string) => void;
  selectEdge: (id: string) => void;
  clearSelection: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  selection: null,
  selectNode: (id) => set({ selection: { type: "node", id } }),
  selectEdge: (id) => set({ selection: { type: "edge", id } }),
  clearSelection: () => set({ selection: null }),
}));
