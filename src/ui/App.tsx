import { useCallback, useEffect, useState } from "react";
import { Canvas } from "../render/Canvas.tsx";
import { loadDocumentFromUrl } from "../io/fileAdapter.ts";
import { applyCommand } from "../domain/commands.ts";
import type { Command } from "../domain/commands.ts";
import type { Document } from "../domain/types.ts";
import { useUIStore } from "./store.ts";
import { NodeInspector } from "./NodeInspector.tsx";
import { Toolbar } from "./Toolbar.tsx";

const DOCUMENT_URL = "/architecture.archik.yaml";

type State =
  | { status: "loading" }
  | { status: "ready"; document: Document }
  | { status: "error"; error: string };

export function App(): React.ReactElement {
  const [state, setState] = useState<State>({ status: "loading" });
  const [commandError, setCommandError] = useState<string | undefined>(
    undefined,
  );
  const selection = useUIStore((s) => s.selection);
  const selectNode = useUIStore((s) => s.selectNode);
  const clearSelection = useUIStore((s) => s.clearSelection);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadDocumentFromUrl(DOCUMENT_URL).then(
      (document) => {
        if (!cancelled) setState({ status: "ready", document });
      },
      (err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: "error", error: message });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

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
      <Toolbar document={doc} commandError={commandError} />
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
