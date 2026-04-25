import { useEffect, useState } from "react";
import { Canvas } from "../render/Canvas.tsx";
import { loadDocumentFromUrl } from "../io/fileAdapter.ts";
import type { Document } from "../domain/types.ts";

const DOCUMENT_URL = "/architecture.archik.yaml";

type State =
  | { status: "loading" }
  | { status: "ready"; document: Document }
  | { status: "error"; error: string };

export function App(): React.ReactElement {
  const [state, setState] = useState<State>({ status: "loading" });

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

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900">
      <header className="flex items-baseline gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <span className="text-base font-semibold tracking-tight">Archik</span>
        <span className="text-xs text-slate-500">
          {state.status === "ready" ? state.document.name : DOCUMENT_URL}
        </span>
      </header>
      <main className="min-h-0 flex-1 p-6">
        <div className="h-full w-full rounded-lg border border-slate-200 bg-white shadow-sm">
          {state.status === "loading" && (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Loading {DOCUMENT_URL}…
            </div>
          )}
          {state.status === "error" && (
            <div className="flex h-full items-start justify-center overflow-auto p-6">
              <pre className="max-w-3xl whitespace-pre-wrap text-xs text-rose-700">
                {state.error}
              </pre>
            </div>
          )}
          {state.status === "ready" && (
            <Canvas
              document={state.document}
              className="h-full w-full"
            />
          )}
        </div>
      </main>
    </div>
  );
}
