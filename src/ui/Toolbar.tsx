import type { Document } from "../domain/types.ts";
import { saveDocumentAsDownload } from "../io/fileAdapter.ts";
import { exporters } from "../io/exporters.ts";
import { CopyButton } from "./CopyButton.tsx";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  document: Document;
  filename?: string;
  commandError?: string | undefined;
  reloadError?: string | undefined;
  saveStatus?: SaveStatus;
};

const SAVE_LABELS: Record<SaveStatus, string | null> = {
  idle: null,
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

const SAVE_CLASSES: Record<SaveStatus, string> = {
  idle: "",
  saving: "bg-slate-100 text-slate-600",
  saved: "bg-emerald-50 text-emerald-700",
  error: "bg-rose-50 text-rose-700",
};

export function Toolbar({
  document,
  filename = "architecture.archik.yaml",
  commandError,
  reloadError,
  saveStatus = "idle",
}: Props): React.ReactElement {
  const saveLabel = SAVE_LABELS[saveStatus];
  return (
    <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <span className="text-base font-semibold tracking-tight">Archik</span>
      <span className="text-xs text-slate-500">{document.name}</span>
      {commandError !== undefined && (
        <span className="rounded bg-rose-50 px-2 py-0.5 text-xs text-rose-700">
          {commandError}
        </span>
      )}
      {reloadError !== undefined && (
        <span
          className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
          title={reloadError}
        >
          File reload error
        </span>
      )}
      {saveLabel !== null && (
        <span
          className={`rounded px-2 py-0.5 text-xs ${SAVE_CLASSES[saveStatus]}`}
        >
          {saveLabel}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {exporters.map((exporter) => (
          <CopyButton
            key={exporter.name}
            exporter={exporter}
            document={document}
          />
        ))}
        <button
          type="button"
          onClick={() => saveDocumentAsDownload(filename, document)}
          className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          Download YAML
        </button>
      </div>
    </header>
  );
}
