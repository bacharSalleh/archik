import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "../render/Canvas.tsx";
import {
  loadDocumentFromUrlWithText,
  saveDocumentToUrl,
} from "../io/fileAdapter.ts";
import { parseYaml, stringifyYaml } from "../io/yaml.ts";
import {
  subscribeToDocumentChanges,
  subscribeToSuggestionChanges,
} from "../io/liveReload.ts";
import { diffDocuments, mergeForDiff, statusMap } from "../domain/diff.ts";
import type { StatusMap } from "../domain/diff.ts";
import { applyCommand } from "../domain/commands.ts";
import type { Command } from "../domain/commands.ts";
import type { Document, NodeKind } from "../domain/types.ts";
import { slugify, uniqueId } from "../domain/idGen.ts";
import type { Edge } from "../domain/types.ts";
import { useUIStore, type SelectionItem } from "./store.ts";
import { NodeInspector } from "./NodeInspector.tsx";
import { EdgeInspector } from "./EdgeInspector.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { Breadcrumbs } from "./Breadcrumbs.tsx";
import {
  densityToLayoutOptions,
  loadDensity,
  loadViewMode,
  saveDensity,
  saveViewMode,
} from "./LayoutControls.tsx";
import type { ViewMode } from "../layout/types.ts";

const ROOT_DOCUMENT_URL = "/architecture.archik.yaml";
const ROOT_SUGGESTION_URL = "/architecture.archik.suggested.yaml";
const ROOT_ACCEPT_URL = "/__archik/accept-suggestion";
const SAVED_INDICATOR_MS = 1500;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type State =
  | { status: "loading" }
  | { status: "ready"; document: Document }
  | { status: "error"; error: string };

/**
 * One frame in the navigation stack. The root frame uses the
 * stable canonical URLs above; every drill-down frame is built
 * from a node's `archikFile` and points at the generic per-file
 * endpoint. The breadcrumb bar walks this stack left-to-right.
 */
export type FileFrame = {
  /** Short label shown in the breadcrumb bar. */
  label: string;
  /** GET / PUT this URL to read/write the doc. */
  docUrl: string;
  /** GET / PUT / DELETE this URL for the suggestion sidecar. */
  sidecarUrl: string;
  /** POST this URL to accept the suggestion sidecar. */
  acceptUrl: string;
  /** Original `archikFile` value used to navigate here, or null at root. */
  archikFile: string | null;
};

const ROOT_FRAME: FileFrame = {
  label: "main",
  docUrl: ROOT_DOCUMENT_URL,
  sidecarUrl: ROOT_SUGGESTION_URL,
  acceptUrl: ROOT_ACCEPT_URL,
  archikFile: null,
};

function frameForArchikFile(archikFile: string, label: string): FileFrame {
  const sidecar = archikFile.replace(/\.archik\.yaml$/, ".archik.suggested.yaml");
  const enc = encodeURIComponent(archikFile);
  const encSidecar = encodeURIComponent(sidecar);
  return {
    label,
    docUrl: `/__archik/file?path=${enc}`,
    sidecarUrl: `/__archik/file?path=${encSidecar}`,
    acceptUrl: `/__archik/file-accept?path=${enc}`,
    archikFile,
  };
}

export function App(): React.ReactElement {
  const [state, setState] = useState<State>({ status: "loading" });
  // Navigation stack — the last element is the file currently loaded
  // in the canvas. Pushed by drill-down (a node's `archikFile`),
  // popped by breadcrumb / back. Root is always present at index 0.
  const [fileStack, setFileStack] = useState<FileFrame[]>([ROOT_FRAME]);
  const currentFile = fileStack[fileStack.length - 1]!;
  const [commandError, setCommandError] = useState<string | undefined>(
    undefined,
  );
  const [reloadError, setReloadError] = useState<string | undefined>(
    undefined,
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isDirty, setIsDirty] = useState(false);
  // Pending Claude-authored suggestion sidecar. Banner shows when
  // present; user picks Review (opens server-rendered diff in a new
  // tab), Accept (POST → main becomes sidecar), or Reject (DELETE).
  const [suggestion, setSuggestion] = useState<
    | { status: "none" }
    | {
        status: "pending";
        added: number;
        removed: number;
        changed: number;
        note?: string | undefined;
        // Cache the parsed sidecar so Review can render instantly
        // without re-parsing or hitting the network.
        doc: Document;
      }
    | { status: "error"; message: string }
  >({ status: "none" });
  const [reviewMode, setReviewMode] = useState<boolean>(false);
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
    // Each frame gets a fresh self-write-echo guard — the previous
    // file's last text isn't relevant for this one.
    lastTextRef.current = "";
    const load = (): void => {
      loadDocumentFromUrlWithText(currentFile.docUrl).then(
        ({ document, text }) => {
          if (cancelled) return;
          if (text === lastTextRef.current) return; // self-write echo
          lastTextRef.current = text;
          loadedOnceRef.current = true;
          setState({ status: "ready", document });
          setIsDirty(false);
          if (typeof window !== "undefined" && document.name) {
            window.document.title = `${document.name} — Archik`;
          }
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
    setState({ status: "loading" });
    load();
    const unsubscribe = subscribeToDocumentChanges(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // Re-run on navigation: each frame loads its own document.
  }, [currentFile.docUrl]);

  useEffect(() => {
    return () => {
      if (savedIndicatorTimerRef.current) {
        clearTimeout(savedIndicatorTimerRef.current);
      }
    };
  }, []);

  // Pending-suggestion poll. Runs whenever the main doc reloads (so
  // the diff stats refresh against the latest truth) and on every
  // `archik:suggestion-changed` event from the dev server.
  useEffect(() => {
    if (state.status !== "ready") return;
    const currentDoc = state.document;
    let cancelled = false;
    const loadSuggestion = async (): Promise<void> => {
      try {
        const res = await fetch(currentFile.sidecarUrl, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 404) {
          setSuggestion({ status: "none" });
          return;
        }
        if (!res.ok) {
          setSuggestion({
            status: "error",
            message: `Sidecar fetch failed: HTTP ${res.status}`,
          });
          return;
        }
        const text = await res.text();
        let sidecarDoc: Document;
        try {
          sidecarDoc = parseYaml(text);
        } catch (err) {
          setSuggestion({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
          return;
        }
        const diff = diffDocuments(currentDoc, sidecarDoc);
        setSuggestion({
          status: "pending",
          added: diff.nodes.added.length + diff.edges.added.length,
          removed: diff.nodes.removed.length + diff.edges.removed.length,
          changed: diff.nodes.changed.length + diff.edges.changed.length,
          doc: sidecarDoc,
          ...(sidecarDoc.metadata?.suggestion?.note !== undefined
            ? { note: sidecarDoc.metadata.suggestion.note }
            : {}),
        });
      } catch (err) {
        if (cancelled) return;
        setSuggestion({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    };
    void loadSuggestion();
    const unsubscribe = subscribeToSuggestionChanges(loadSuggestion);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [state, currentFile.sidecarUrl]);

  const acceptSuggestion = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(currentFile.acceptUrl, { method: "POST" });
      if (!res.ok) {
        const body = await res.text();
        setSuggestion({
          status: "error",
          message: `Accept failed: ${body || `HTTP ${res.status}`}`,
        });
        return;
      }
      setSuggestion({ status: "none" });
      setReviewMode(false);
      // The watcher will fire archik:doc-changed and the main load
      // effect will repaint with the new YAML.
    } catch (err) {
      setSuggestion({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [currentFile.acceptUrl]);

  const rejectSuggestion = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(currentFile.sidecarUrl, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        const body = await res.text();
        setSuggestion({
          status: "error",
          message: `Reject failed: ${body || `HTTP ${res.status}`}`,
        });
        return;
      }
      setSuggestion({ status: "none" });
      setReviewMode(false);
    } catch (err) {
      setSuggestion({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [currentFile.sidecarUrl]);

  const toggleReview = useCallback((): void => {
    setReviewMode((m) => !m);
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
      await saveDocumentToUrl(currentFile.docUrl, docToSave);
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
  }, [currentFile.docUrl]);

  // Drill into a node's sub-architecture. Pushes a new frame onto
  // the stack; the load effect picks up the URL change and refetches.
  const openSubFile = useCallback(
    (archikFile: string, label: string): void => {
      setFileStack((s) => [...s, frameForArchikFile(archikFile, label)]);
    },
    [],
  );

  // Pop the navigation stack to a specific depth (0 = root only).
  // Clicking "main" in the breadcrumbs is goToFrame(0).
  const goToFrame = useCallback((index: number): void => {
    setFileStack((s) => {
      if (index < 0 || index >= s.length - 1) return s;
      return s.slice(0, index + 1);
    });
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
    return <Splash>Loading {currentFile.docUrl}…</Splash>;
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
  // Review mode swaps the rendered document for the merged (current ∪
  // suggestion) view and computes per-id status flags so the canvas
  // can frame added / changed / removed items in the right colour.
  const reviewing =
    reviewMode &&
    suggestion.status === "pending";
  const reviewMerged =
    reviewing && suggestion.status === "pending"
      ? mergeForDiff(doc, suggestion.doc)
      : null;
  const reviewStatuses: StatusMap | null =
    reviewing && suggestion.status === "pending"
      ? statusMap(diffDocuments(doc, suggestion.doc))
      : null;
  const renderDoc = reviewMerged ?? doc;
  // Look up the focused entity in renderDoc (not doc) so that nodes /
  // edges that only exist in the suggestion sidecar still resolve when
  // reviewing — otherwise the inspector shows the empty state for any
  // newly-added entity and the user can't see its description / fields.
  const selectedNode =
    focused?.type === "node"
      ? renderDoc.nodes.find((n) => n.id === focused.id)
      : undefined;
  const selectedEdge =
    focused?.type === "edge"
      ? renderDoc.edges.find((e) => e.id === focused.id)
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
      {suggestion.status === "pending" && (
        <SuggestionBanner
          added={suggestion.added}
          removed={suggestion.removed}
          changed={suggestion.changed}
          note={suggestion.note}
          reviewing={reviewing}
          onReview={toggleReview}
          onAccept={() => void acceptSuggestion()}
          onReject={() => void rejectSuggestion()}
        />
      )}
      {suggestion.status === "error" && (
        <div
          role="alert"
          style={{
            background: "rgba(217, 119, 6, 0.12)",
            borderBottom: "1px solid rgba(217, 119, 6, 0.45)",
            color: "var(--archik-warning)",
            padding: "8px 16px",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontWeight: 700 }}>SUGGESTION ERROR —</span>
          <span style={{ flex: 1, color: "var(--archik-fg)" }}>
            {suggestion.message}
          </span>
          <button
            type="button"
            onClick={() => setSuggestion({ status: "none" })}
            aria-label="Dismiss"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--archik-fg-dim)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}
      {reloadError !== undefined && (
        <div
          role="alert"
          style={{
            background: "rgba(225, 29, 72, 0.12)",
            borderBottom: "1px solid rgba(225, 29, 72, 0.45)",
            color: "var(--archik-danger)",
            padding: "10px 16px",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontWeight: 700, letterSpacing: "0.04em" }}>
            FILE INVALID —
          </span>
          <pre
            style={{
              margin: 0,
              flex: 1,
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              color: "var(--archik-fg)",
            }}
          >
            {reloadError}
          </pre>
          <button
            type="button"
            onClick={() => setReloadError(undefined)}
            aria-label="Dismiss error"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--archik-fg-dim)",
              cursor: "pointer",
              padding: "0 4px",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}
      <main
        className="flex min-h-0 flex-1 p-4"
        style={{ gap: 0 }}
      >
        <div
          className="archik-panel"
          style={{ flex: 1, minWidth: 0, overflow: "hidden" }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              width: "100%",
            }}
          >
            <Breadcrumbs stack={fileStack} onGoToFrame={goToFrame} />
            <Canvas
              document={renderDoc}
              className="flex-1 archik-grid"
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
              onOpenSubFile={openSubFile}
              {...(reviewStatuses ? { diffStatuses: reviewStatuses } : {})}
            />
          </div>
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
              <EdgeInspector
                edge={selectedEdge}
                dispatch={dispatch}
                readOnly={reviewing}
              />
            ) : focused?.type === "node" ? (
              <NodeInspector
                node={selectedNode}
                dispatch={dispatch}
                onStartConnect={startConnect}
                allNodes={renderDoc.nodes}
                readOnly={reviewing}
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

function SuggestionBanner({
  added,
  removed,
  changed,
  note,
  reviewing,
  onReview,
  onAccept,
  onReject,
}: {
  added: number;
  removed: number;
  changed: number;
  note?: string | undefined;
  reviewing: boolean;
  onReview: () => void;
  onAccept: () => void;
  onReject: () => void;
}): React.ReactElement {
  const total = added + removed + changed;
  return (
    <div
      role="region"
      aria-label="Pending suggestion"
      style={{
        background: "rgba(168, 85, 247, 0.12)",
        borderBottom: "1px solid rgba(168, 85, 247, 0.45)",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      <span
        style={{
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: "#c4b5fd",
        }}
      >
        📝 SUGGESTION PENDING
      </span>
      <span style={{ color: "var(--archik-fg)" }}>
        {total === 0 ? (
          "(identical to current — nothing to apply)"
        ) : (
          <>
            <span style={{ color: "var(--archik-success)" }}>
              +{added}
            </span>{" "}
            <span style={{ color: "var(--archik-danger)" }}>
              −{removed}
            </span>{" "}
            <span style={{ color: "var(--archik-warning)" }}>
              ~{changed}
            </span>
          </>
        )}
        {note ? (
          <span
            style={{
              marginLeft: 10,
              color: "var(--archik-fg-dim)",
              fontStyle: "italic",
            }}
          >
            "{note}"
          </span>
        ) : null}
      </span>
      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onReview}
          className="archik-btn"
          style={{
            padding: "5px 12px",
            fontSize: 12,
            ...(reviewing
              ? {
                  background: "#a855f7",
                  color: "white",
                  borderColor: "#a855f7",
                }
              : {}),
          }}
        >
          {reviewing ? "Hide diff" : "Review"}
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={total === 0}
          className="archik-btn"
          style={{
            padding: "5px 12px",
            fontSize: 12,
            background: "var(--archik-success)",
            color: "white",
            borderColor: "var(--archik-success)",
            opacity: total === 0 ? 0.5 : 1,
          }}
        >
          Accept
        </button>
        <button
          type="button"
          onClick={onReject}
          className="archik-btn"
          style={{
            padding: "5px 12px",
            fontSize: 12,
            color: "var(--archik-danger)",
            borderColor: "var(--archik-danger)",
          }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
