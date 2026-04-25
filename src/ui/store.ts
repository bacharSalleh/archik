import { create } from "zustand";

export type SelectionItem =
  | { type: "node"; id: string }
  | { type: "edge"; id: string };

export type UIState = {
  /** Current selection. Empty array = nothing selected. */
  selection: SelectionItem[];
  /** Source node id while drag/click connect mode is active. */
  connectFrom: string | null;

  /** Replace the selection with a single node. */
  selectNode: (id: string) => void;
  /** Replace the selection with a single edge. */
  selectEdge: (id: string) => void;
  /** Add or remove a node from the selection (cmd/shift+click). */
  toggleNode: (id: string) => void;
  /** Add or remove an edge from the selection. */
  toggleEdge: (id: string) => void;
  clearSelection: () => void;

  startConnect: (from: string) => void;
  cancelConnect: () => void;
};

function sameItem(a: SelectionItem, b: SelectionItem): boolean {
  return a.type === b.type && a.id === b.id;
}

export const useUIStore = create<UIState>((set) => ({
  selection: [],
  connectFrom: null,
  selectNode: (id) => set({ selection: [{ type: "node", id }] }),
  selectEdge: (id) => set({ selection: [{ type: "edge", id }] }),
  toggleNode: (id) =>
    set((s) => {
      const item: SelectionItem = { type: "node", id };
      const exists = s.selection.some((x) => sameItem(x, item));
      return {
        selection: exists
          ? s.selection.filter((x) => !sameItem(x, item))
          : [...s.selection, item],
      };
    }),
  toggleEdge: (id) =>
    set((s) => {
      const item: SelectionItem = { type: "edge", id };
      const exists = s.selection.some((x) => sameItem(x, item));
      return {
        selection: exists
          ? s.selection.filter((x) => !sameItem(x, item))
          : [...s.selection, item],
      };
    }),
  clearSelection: () => set({ selection: [] }),
  startConnect: (from) => set({ connectFrom: from, selection: [] }),
  cancelConnect: () => set({ connectFrom: null }),
}));

/** Convenience: the focused item (last added). null when empty. */
export function focusedSelection(
  selection: SelectionItem[],
): SelectionItem | null {
  return selection.length > 0 ? (selection.at(-1) ?? null) : null;
}
