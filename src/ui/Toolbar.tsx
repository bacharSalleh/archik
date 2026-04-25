import type { Document, NodeKind } from "../domain/types.ts";
import { saveDocumentAsDownload } from "../io/fileAdapter.ts";
import { exporters } from "../io/exporters.ts";
import { CopyButton } from "./CopyButton.tsx";
import { AddNodeForm } from "./AddNodeForm.tsx";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  document: Document;
  filename?: string;
  commandError?: string | undefined;
  reloadError?: string | undefined;
  saveStatus?: SaveStatus;
  isDirty?: boolean;
  onSave?: () => void;
  onAddNode?: (kind: NodeKind, name: string) => void;
  connectingFromName?: string;
  onCancelConnect?: () => void;
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
  isDirty = false,
  onSave,
  onAddNode,
  connectingFromName,
  onCancelConnect,
}: Props): React.ReactElement {
  const saveLabel = SAVE_LABELS[saveStatus];
  const shortcutHint =
    typeof navigator !== "undefined" && /Mac/i.test(navigator.platform)
      ? "⌘S"
      : "Ctrl+S";
  return (
    <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <span className="text-base font-semibold tracking-tight">Archik</span>
      <span className="text-xs text-slate-500">{document.name}</span>
      {connectingFromName !== undefined && (
        <span className="flex items-center gap-2 rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-800">
          Connecting from <strong>{connectingFromName}</strong> — click a node
          to finish, or
          <button
            type="button"
            onClick={onCancelConnect}
            className="underline hover:no-underline"
          >
            cancel (Esc)
          </button>
        </span>
      )}
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
        {onAddNode !== undefined && <AddNodeForm onAdd={onAddNode} />}
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
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty || saveStatus === "saving"}
          title={`Save to ${filename} (${shortcutHint})`}
          className="rounded border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-400"
        >
          {isDirty ? "Save •" : "Save"}
        </button>
      </div>
    </header>
  );
}
