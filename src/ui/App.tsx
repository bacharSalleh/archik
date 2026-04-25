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
import type { Document } from "../domain/types.ts";
import { useUIStore } from "./store.ts";
import { NodeInspector } from "./NodeInspector.tsx";
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
  const selectNode = useUIStore((s) => s.selectNode);
  const clearSelection = useUIStore((s) => s.clearSelection);

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

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty) void save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDirty, save]);

  const dispatch = useCallback(
    (cmd: Command) => {
      setState((current) => {
        if (current.status !== "ready") return current;
        try {
          const next = applyCommand(current.document, cmd);
          setCommandError(undefined);
          if (cmd.type === "remove_node" && selection?.id === cmd.id) {
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

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900">
      <Toolbar
        document={doc}
        commandError={commandError}
        saveStatus={saveStatus}
        isDirty={isDirty}
        onSave={() => void save()}
        {...(reloadError !== undefined ? { reloadError } : {})}
      />
      <main className="grid min-h-0 flex-1 grid-cols-[1fr_320px] gap-4 p-4">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <Canvas
            document={doc}
            className="h-full w-full"
            {...(selection?.type === "node"
              ? { selectedNodeId: selection.id }
              : {})}
            onSelectNode={selectNode}
            onSelectNothing={clearSelection}
          />
        </div>
        <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <NodeInspector node={selectedNode} dispatch={dispatch} />
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
