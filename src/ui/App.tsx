import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "../render/Canvas.tsx";
import {
  loadDocumentFromUrlWithText,
  saveDocumentToUrl,
} from "../io/fileAdapter.ts";
import { stringifyYaml } from "../io/yaml.ts";
import { subscribeToDocumentChanges } from "../io/liveReload.ts";
import { applyCommand } from "../domain/commands.ts";
import type { Command } from "../domain/commands.ts";
import type { Document, NodeKind } from "../domain/types.ts";
import { slugify, uniqueId } from "../domain/idGen.ts";
import type { Edge } from "../domain/types.ts";
import { useUIStore, type SelectionItem } from "./store.ts";
import { NodeInspector } from "./NodeInspector.tsx";
import { EdgeInspector } from "./EdgeInspector.tsx";
import { Toolbar } from "./Toolbar.tsx";
import {
  densityToLayoutOptions,
  loadDensity,
  loadViewMode,
  saveDensity,
  saveViewMode,
} from "./LayoutControls.tsx";
import type { ViewMode } from "../layout/types.ts";

const DOCUMENT_URL = "/architecture.archik.yaml";
const SAVED_INDICATOR_MS = 1500;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type State =
  | { status: "loading" }
  | { status: "ready"; document: Document }
  | { status: "error"; error: string };

export function App(): React.ReactElement {
  const [state, setState] = useState<State>({ status: "loading" });
  const [commandError, setCommandError] = useState<string | undefined>(
    undefined,
  );
  const [reloadError, setReloadError] = useState<string | undefined>(
    undefined,
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isDirty, setIsDirty] = useState(false);
  // Undo / redo stacks. Each successful command snapshots the previous
  // document to `past` and clears `future`. Externally-driven loads
  // (file watcher, fresh fetch) reset both — undo can't span across.
  const [past, setPast] = useState<Document[]>([]);
  const [future, setFuture] = useState<Document[]>([]);
  const HISTORY_LIMIT = 100;
  const [density, setDensityState] = useState<number>(() => loadDensity());
  const setDensity = (v: number): void => {
    setDensityState(v);
    saveDensity(v);
  };
  const [viewMode, setViewModeState] = useState<ViewMode>(() => loadViewMode());
  const setViewMode = (v: ViewMode): void => {
    setViewModeState(v);
    saveViewMode(v);
  };
  const layoutOptions = useMemo(
    () => ({ ...densityToLayoutOptions(density), viewMode }),
    [density, viewMode],
  );
  const loadedOnceRef = useRef(false);
  const lastTextRef = useRef<string | null>(null);
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const selection = useUIStore((s) => s.selection);
  const connectFrom = useUIStore((s) => s.connectFrom);
  const selectNode = useUIStore((s) => s.selectNode);
  const selectEdge = useUIStore((s) => s.selectEdge);
  const toggleNode = useUIStore((s) => s.toggleNode);
  const toggleEdge = useUIStore((s) => s.toggleEdge);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const startConnect = useUIStore((s) => s.startConnect);
  const cancelConnect = useUIStore((s) => s.cancelConnect);

  const focused: SelectionItem | null =
    selection.length > 0 ? (selection.at(-1) ?? null) : null;
  const selectedNodeIds = useMemo(
    () =>
      new Set(
        selection.filter((s) => s.type === "node").map((s) => s.id),
      ),
    [selection],
  );
  const selectedEdgeIds = useMemo(
    () =>
      new Set(
        selection.filter((s) => s.type === "edge").map((s) => s.id),
      ),
    [selection],
  );

  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      loadDocumentFromUrlWithText(DOCUMENT_URL).then(
        ({ document, text }) => {
          if (cancelled) return;
          if (text === lastTextRef.current) return; // self-write echo
          lastTextRef.current = text;
          loadedOnceRef.current = true;
          setState({ status: "ready", document });
          setIsDirty(false);
          setReloadError(undefined);
          setPast([]);
          setFuture([]);
          // External file change may have removed nodes / edges that
          // were currently selected or being connected from. Drop any
          // stale UI state to keep the inspector and connect overlay
          // consistent with the freshly-loaded document.
          const validNodeIds = new Set(document.nodes.map((n) => n.id));
          const validEdgeIds = new Set(document.edges.map((e) => e.id));
          useUIStore.setState((s) => ({
            selection: s.selection.filter((sel) =>
              sel.type === "node"
                ? validNodeIds.has(sel.id)
                : validEdgeIds.has(sel.id),
            ),
            connectFrom:
              s.connectFrom !== null && validNodeIds.has(s.connectFrom)
                ? s.connectFrom
                : null,
          }));
        },
        (err: unknown) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : String(err);
          if (loadedOnceRef.current) {
            setReloadError(message);
          } else {
            setState({ status: "error", error: message });
          }
        },
      );
    };
    load();
    const unsubscribe = subscribeToDocumentChanges(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (savedIndicatorTimerRef.current) {
        clearTimeout(savedIndicatorTimerRef.current);
      }
    };
  }, []);

  const save = useCallback(async () => {
    let docToSave: Document | null = null;
    setState((current) => {
      if (current.status === "ready") docToSave = current.document;
      return current;
    });
    if (!docToSave) return;
    // Stash the text BEFORE the PUT so a watcher event triggered by
    // our own write (which can race the response) is recognised as
    // self-write echo and not re-applied to in-memory state.
    const text = stringifyYaml(docToSave);
    lastTextRef.current = text;
    setSaveStatus("saving");
    try {
      await saveDocumentToUrl(DOCUMENT_URL, docToSave);
      setSaveStatus("saved");
      // Only clear the dirty flag if the in-memory document still matches
      // what we just persisted. The user may have kept editing during the
      // PUT, in which case there are unsaved changes ahead of the file.
      let stillSame = false;
      setState((current) => {
        if (
          current.status === "ready" &&
          current.document === docToSave
        ) {
          stillSame = true;
        }
        return current;
      });
      if (stillSame) setIsDirty(false);
      if (savedIndicatorTimerRef.current) {
        clearTimeout(savedIndicatorTimerRef.current);
      }
      savedIndicatorTimerRef.current = setTimeout(
        () => setSaveStatus("idle"),
        SAVED_INDICATOR_MS,
      );
    } catch {
      setSaveStatus("error");
    }
  }, []);

  const handleSelectNode = useCallback(
    (id: string, event?: React.MouseEvent) => {
      if (connectFrom === null) {
        if (event && (event.metaKey || event.ctrlKey || event.shiftKey)) {
          toggleNode(id);
        } else {
          selectNode(id);
        }
        return;
      }
      if (id === connectFrom) {
        cancelConnect();
        return;
      }
      let createdEdgeId: string | null = null;
      setState((current) => {
        if (current.status !== "ready") return current;
        const fromNode = current.document.nodes.find(
          (n) => n.id === connectFrom,
        );
        if (!fromNode) return current;
        const taken = new Set(current.document.edges.map((e) => e.id));
        const edgeId = uniqueId(
          slugify(`${connectFrom}-${id}`),
          taken,
          "edge",
        );
        const edge: Edge = {
          id: edgeId,
          from: connectFrom,
          to: id,
          relationship: "http_call",
        };
        try {
          const next = applyCommand(current.document, {
            type: "connect",
            edge,
          });
          setCommandError(undefined);
          setIsDirty(true);
          setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), current.document]);
          setFuture([]);
          createdEdgeId = edgeId;
          return { status: "ready", document: next };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setCommandError(message);
          return current;
        }
      });
      cancelConnect();
      if (createdEdgeId) selectEdge(createdEdgeId);
    },
    [connectFrom, cancelConnect, selectNode, toggleNode, selectEdge],
  );

  const handleSelectEdge = useCallback(
    (id: string, event?: React.MouseEvent) => {
      if (event && (event.metaKey || event.ctrlKey || event.shiftKey)) {
        toggleEdge(id);
      } else {
        selectEdge(id);
      }
    },
    [selectEdge, toggleEdge],
  );

  const handleConnectDrag = useCallback(
    (fromId: string, toId: string) => {
      let createdEdgeId: string | null = null;
      setState((current) => {
        if (current.status !== "ready") return current;
        const fromNode = current.document.nodes.find((n) => n.id === fromId);
        const toNode = current.document.nodes.find((n) => n.id === toId);
        if (!fromNode || !toNode) return current;
        const taken = new Set(current.document.edges.map((e) => e.id));
        const edgeId = uniqueId(slugify(`${fromId}-${toId}`), taken, "edge");
        const edge: Edge = {
          id: edgeId,
          from: fromId,
          to: toId,
          relationship: "http_call",
        };
        try {
          const next = applyCommand(current.document, {
            type: "connect",
            edge,
          });
          setCommandError(undefined);
          setIsDirty(true);
          setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), current.document]);
          setFuture([]);
          createdEdgeId = edgeId;
          return { status: "ready", document: next };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setCommandError(message);
          return current;
        }
      });
      if (createdEdgeId) selectEdge(createdEdgeId);
    },
    [selectEdge],
  );

  const addNode = useCallback(
    (kind: NodeKind, name: string) => {
      setState((current) => {
        if (current.status !== "ready") return current;
        const taken = new Set(current.document.nodes.map((n) => n.id));
        const id = uniqueId(slugify(name), taken, kind);
        try {
          const next = applyCommand(current.document, {
            type: "add_node",
            node: { id, kind, name },
          });
          setCommandError(undefined);
          setIsDirty(true);
          setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), current.document]);
          setFuture([]);
          return { status: "ready", document: next };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setCommandError(message);
          return current;
        }
      });
    },
    [],
  );

  const dispatch = useCallback(
    (cmd: Command) => {
      setState((current) => {
        if (current.status !== "ready") return current;
        try {
          const next = applyCommand(current.document, cmd);
          setCommandError(undefined);
          setIsDirty(true);
          setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), current.document]);
          setFuture([]);
          return { status: "ready", document: next };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setCommandError(message);
          return current;
        }
      });
    },
    [],
  );

  const deleteSelected = useCallback(() => {
    if (selection.length === 0) return;
    // Remove edges first so node-removal doesn't trip over orphan-cascade
    // attempting to drop the same edge twice. Snapshot once for undo.
    setState((current) => {
      if (current.status !== "ready") return current;
      let doc = current.document;
      try {
        const edgeIds = selection
          .filter((s) => s.type === "edge")
          .map((s) => s.id);
        for (const id of edgeIds) {
          if (doc.edges.some((e) => e.id === id)) {
            doc = applyCommand(doc, { type: "disconnect", id });
          }
        }
        const nodeIds = selection
          .filter((s) => s.type === "node")
          .map((s) => s.id);
        for (const id of nodeIds) {
          if (doc.nodes.some((n) => n.id === id)) {
            doc = applyCommand(doc, { type: "remove_node", id });
          }
        }
        if (doc === current.document) return current;
        setCommandError(undefined);
        setIsDirty(true);
        setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), current.document]);
        setFuture([]);
        return { status: "ready", document: doc };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setCommandError(message);
        return current;
      }
    });
    clearSelection();
  }, [selection, clearSelection]);

  const undo = useCallback(() => {
    if (state.status !== "ready" || past.length === 0) return;
    const prev = past[past.length - 1]!;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [...f, state.document]);
    setState({ status: "ready", document: prev });
    setIsDirty(true);
    setCommandError(undefined);
    clearSelection();
  }, [state, past, clearSelection]);

  const redo = useCallback(() => {
    if (state.status !== "ready" || future.length === 0) return;
    const next = future[future.length - 1]!;
    setFuture((f) => f.slice(0, -1));
    setPast((p) => [...p, state.document]);
    setState({ status: "ready", document: next });
    setIsDirty(true);
    setCommandError(undefined);
    clearSelection();
  }, [state, future, clearSelection]);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty) void save();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Escape") {
        if (connectFrom) cancelConnect();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const target = e.target;
        const isEditing =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLElement && target.isContentEditable);
        if (isEditing) return;
        if (selection.length === 0) return;
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    isDirty,
    save,
    connectFrom,
    cancelConnect,
    selection,
    deleteSelected,
    undo,
    redo,
  ]);

  if (state.status === "loading") {
    return <Splash>Loading {DOCUMENT_URL}…</Splash>;
  }
  if (state.status === "error") {
    return (
      <Splash>
        <pre className="max-w-3xl whitespace-pre-wrap text-xs text-rose-700">
          {state.error}
        </pre>
      </Splash>
    );
  }

  const doc = state.document;
  const selectedNode =
    focused?.type === "node"
      ? doc.nodes.find((n) => n.id === focused.id)
      : undefined;
  const selectedEdge =
    focused?.type === "edge"
      ? doc.edges.find((e) => e.id === focused.id)
      : undefined;
  const connectFromNode =
    connectFrom !== null
      ? doc.nodes.find((n) => n.id === connectFrom)
      : undefined;
  const isMultiSelection = selection.length > 1;

  return (
    <div
      className="flex h-full flex-col"
      style={{
        background: "var(--archik-canvas)",
        color: "var(--archik-fg)",
      }}
    >
      <Toolbar
        document={doc}
        commandError={commandError}
        saveStatus={saveStatus}
        isDirty={isDirty}
        onSave={() => void save()}
        onAddNode={addNode}
        density={density}
        onDensityChange={setDensity}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={undo}
        onRedo={redo}
        {...(reloadError !== undefined ? { reloadError } : {})}
        {...(connectFromNode !== undefined
          ? {
              connectingFromName: connectFromNode.name,
              onCancelConnect: cancelConnect,
            }
          : {})}
      />
      <main
        className="flex min-h-0 flex-1 p-4"
        style={{ gap: 0 }}
      >
        <div
          className="archik-panel"
          style={{ flex: 1, minWidth: 0, overflow: "hidden" }}
        >
          <Canvas
            document={doc}
            className="h-full w-full archik-grid"
            layoutOptions={layoutOptions}
            viewMode={viewMode}
            selectedNodeIds={selectedNodeIds}
            selectedEdgeIds={selectedEdgeIds}
            onSelectNode={handleSelectNode}
            onSelectEdge={handleSelectEdge}
            onSelectNothing={
              connectFrom === null ? clearSelection : cancelConnect
            }
            onConnectDrag={handleConnectDrag}
          />
        </div>
        <aside
          aria-hidden={selection.length === 0}
          className={`archik-drawer-shell ${
            selection.length > 0
              ? "archik-drawer-shell--open"
              : "archik-drawer-shell--closed"
          }`}
        >
          <div
            key={
              isMultiSelection
                ? `multi:${selection.length}`
                : focused
                  ? `${focused.type}:${focused.id}`
                  : "empty"
            }
            className="archik-panel archik-drawer-content archik-drawer-fade"
            style={{ overflow: "hidden" }}
          >
            {isMultiSelection ? (
              <BulkInspector
                count={selection.length}
                onDelete={deleteSelected}
                onClear={clearSelection}
              />
            ) : focused?.type === "edge" ? (
              <EdgeInspector edge={selectedEdge} dispatch={dispatch} />
            ) : focused?.type === "node" ? (
              <NodeInspector
                node={selectedNode}
                dispatch={dispatch}
                onStartConnect={startConnect}
                allNodes={doc.nodes}
              />
            ) : null}
          </div>
        </aside>
      </main>
    </div>
  );
}

function BulkInspector({
  count,
  onDelete,
  onClear,
}: {
  count: number;
  onDelete: () => void;
  onClear: () => void;
}): React.ReactElement {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-sm">
      <div>
        <div className="archik-label">Selection</div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "var(--archik-fg)",
            letterSpacing: "0.01em",
          }}
        >
          {count} items
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--archik-fg-dim)",
            marginTop: 4,
          }}
        >
          Hold ⌘ / Ctrl while clicking to add or remove items.
        </div>
      </div>
      <div className="archik-divider" />
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <button
          type="button"
          onClick={onClear}
          className="archik-btn"
          style={{ justifyContent: "center", padding: "8px 12px" }}
        >
          Clear selection
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="archik-btn archik-btn-danger"
          style={{ justifyContent: "center", padding: "8px 12px" }}
        >
          Delete {count} items
        </button>
      </div>
    </div>
  );
}

function Splash({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      className="flex h-full items-center justify-center p-6 text-sm"
      style={{
        background: "var(--archik-canvas)",
        color: "var(--archik-fg-dim)",
      }}
    >
      {children}
    </div>
  );
}
