export const DOCUMENT_CHANGED_EVENT = "archik:doc-changed";

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToDocumentChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitDocumentChanged(): void {
  for (const l of [...listeners]) l();
}

if (import.meta.hot) {
  import.meta.hot.on(DOCUMENT_CHANGED_EVENT, emitDocumentChanged);
}
