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

  /** Container ids the user collapsed on the canvas (view-only). */
  collapsed: Set<string>;
  /** Hide structural (weak) edges. */
  hideStructural: boolean;
  /** Focus mode: show only this node + neighbors within depth. */
  focus: { id: string; depth: number } | null;

  toggleCollapse: (id: string) => void;
  collapseAll: (ids: string[]) => void;
  expandAll: () => void;
  setHideStructural: (v: boolean) => void;
  setFocus: (id: string, depth: number) => void;
  setFocusDepth: (depth: number) => void;
  clearFocus: () => void;
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

  collapsed: new Set<string>(),
  hideStructural: false,
  focus: null,
  toggleCollapse: (id) =>
    set((s) => {
      const next = new Set(s.collapsed);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { collapsed: next };
    }),
  collapseAll: (ids) => set({ collapsed: new Set(ids) }),
  expandAll: () => set({ collapsed: new Set<string>() }),
  setHideStructural: (v) => set({ hideStructural: v }),
  setFocus: (id, depth) => set({ focus: { id, depth } }),
  setFocusDepth: (depth) =>
    set((s) => (s.focus ? { focus: { id: s.focus.id, depth } } : {})),
  clearFocus: () => set({ focus: null }),
}));

/** Convenience: the focused item (last added). null when empty. */
export function focusedSelection(
  selection: SelectionItem[],
): SelectionItem | null {
  return selection.length > 0 ? (selection.at(-1) ?? null) : null;
}
