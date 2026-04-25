import { useCallback, useEffect, useRef, useState } from "react";
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
import { useUIStore } from "./store.ts";
import { NodeInspector } from "./NodeInspector.tsx";
import { EdgeInspector } from "./EdgeInspector.tsx";
import { Toolbar } from "./Toolbar.tsx";

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
  const loadedOnceRef = useRef(false);
  const lastTextRef = useRef<string | null>(null);
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const selection = useUIStore((s) => s.selection);
  const connectFrom = useUIStore((s) => s.connectFrom);
  const selectNode = useUIStore((s) => s.selectNode);
  const selectEdge = useUIStore((s) => s.selectEdge);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const startConnect = useUIStore((s) => s.startConnect);
  const cancelConnect = useUIStore((s) => s.cancelConnect);

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
      setIsDirty(false);
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
    (id: string) => {
      if (connectFrom === null) {
        selectNode(id);
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
    [connectFrom, cancelConnect, selectNode, selectEdge],
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
          if (
            (cmd.type === "remove_node" || cmd.type === "disconnect") &&
            selection?.id === cmd.id
          ) {
            clearSelection();
          }
          setIsDirty(true);
          return { status: "ready", document: next };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setCommandError(message);
          return current;
        }
      });
    },
    [selection, clearSelection],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty) void save();
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
        if (!selection) return;
        e.preventDefault();
        if (selection.type === "node") {
          dispatch({ type: "remove_node", id: selection.id });
        } else {
          dispatch({ type: "disconnect", id: selection.id });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDirty, save, connectFrom, cancelConnect, selection, dispatch]);

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
    selection?.type === "node"
      ? doc.nodes.find((n) => n.id === selection.id)
      : undefined;
  const selectedEdge =
    selection?.type === "edge"
      ? doc.edges.find((e) => e.id === selection.id)
      : undefined;
  const connectFromNode =
    connectFrom !== null
      ? doc.nodes.find((n) => n.id === connectFrom)
      : undefined;

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900">
      <Toolbar
        document={doc}
        commandError={commandError}
        saveStatus={saveStatus}
        isDirty={isDirty}
        onSave={() => void save()}
        onAddNode={addNode}
        {...(reloadError !== undefined ? { reloadError } : {})}
        {...(connectFromNode !== undefined
          ? {
              connectingFromName: connectFromNode.name,
              onCancelConnect: cancelConnect,
            }
          : {})}
      />
      <main className="grid min-h-0 flex-1 grid-cols-[1fr_320px] gap-4 p-4">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <Canvas
            document={doc}
            className="h-full w-full"
            {...(selection?.type === "node"
              ? { selectedNodeId: selection.id }
              : {})}
            {...(selection?.type === "edge"
              ? { selectedEdgeId: selection.id }
              : {})}
            onSelectNode={handleSelectNode}
            onSelectEdge={selectEdge}
            onSelectNothing={
              connectFrom === null ? clearSelection : cancelConnect
            }
          />
        </div>
        <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
          {selection?.type === "edge" ? (
            <EdgeInspector edge={selectedEdge} dispatch={dispatch} />
          ) : (
            <NodeInspector
              node={selectedNode}
              dispatch={dispatch}
              onStartConnect={startConnect}
              allNodes={doc.nodes}
            />
          )}
        </aside>
      </main>
    </div>
  );
}

function Splash({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex h-full items-center justify-center bg-slate-50 p-6 text-sm text-slate-500">
      {children}
    </div>
  );
}
