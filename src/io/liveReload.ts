export const DOCUMENT_CHANGED_EVENT = "archik:doc-changed";
export const SUGGESTION_CHANGED_EVENT = "archik:suggestion-changed";

type Listener = () => void;
const docListeners = new Set<Listener>();
const suggestionListeners = new Set<Listener>();

export function subscribeToDocumentChanges(listener: Listener): () => void {
  attachLiveReload();
  docListeners.add(listener);
  return () => {
    docListeners.delete(listener);
  };
}

export function subscribeToSuggestionChanges(listener: Listener): () => void {
  attachLiveReload();
  suggestionListeners.add(listener);
  return () => {
    suggestionListeners.delete(listener);
  };
}

export function emitDocumentChanged(): void {
  for (const l of [...docListeners]) l();
}

export function emitSuggestionChanged(): void {
  for (const l of [...suggestionListeners]) l();
}

// Live-reload comes from one of two sources:
//   * the bundled `archik dev` server (SSE on /__archik/events) — this
//     is what users get from a published install
//   * Vite's HMR channel during in-repo `npm run dev`
// Both are wired lazily on first subscribe so plain unit tests don't
// open background sockets just by importing the module.
let liveReloadAttached = false;
function attachLiveReload(): void {
  if (liveReloadAttached) return;
  liveReloadAttached = true;
  if (typeof window === "undefined") return;
  if (typeof EventSource !== "undefined") {
    try {
      const events = new EventSource("/__archik/events");
      events.addEventListener(DOCUMENT_CHANGED_EVENT, () =>
        emitDocumentChanged(),
      );
      events.addEventListener(SUGGESTION_CHANGED_EVENT, () =>
        emitSuggestionChanged(),
      );
    } catch {
      // sandbox / CSP blocks EventSource — canvas still loads, just
      // without live reload.
    }
  }
  if (import.meta.hot) {
    import.meta.hot.on(DOCUMENT_CHANGED_EVENT, emitDocumentChanged);
    import.meta.hot.on(SUGGESTION_CHANGED_EVENT, emitSuggestionChanged);
  }
}
