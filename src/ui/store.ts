import { create } from "zustand";

export type Selection =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | null;

export type UIState = {
  selection: Selection;
  connectFrom: string | null;
  selectNode: (id: string) => void;
  selectEdge: (id: string) => void;
  clearSelection: () => void;
  startConnect: (from: string) => void;
  cancelConnect: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  selection: null,
  connectFrom: null,
  selectNode: (id) => set({ selection: { type: "node", id } }),
  selectEdge: (id) => set({ selection: { type: "edge", id } }),
  clearSelection: () => set({ selection: null }),
  startConnect: (from) => set({ connectFrom: from, selection: null }),
  cancelConnect: () => set({ connectFrom: null }),
}));
