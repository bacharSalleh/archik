import type { Document, NodeKind } from "../domain/types.ts";
import { saveDocumentAsDownload } from "../io/fileAdapter.ts";
import { exporters } from "../io/exporters.ts";
import { CopyButton } from "./CopyButton.tsx";
import { AddNodeForm } from "./AddNodeForm.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

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

const SAVE_VARIANT: Record<SaveStatus, string> = {
  idle: "",
  saving: "archik-pill archik-pill--info",
  saved: "archik-pill archik-pill--success",
  error: "archik-pill archik-pill--danger",
};

const SAVE_LABELS: Record<SaveStatus, string | null> = {
  idle: null,
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
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
    <header
      className="flex items-center gap-3 px-4 py-2.5"
      style={{
        background: "var(--archik-panel)",
        borderBottom: "1px solid var(--archik-border)",
      }}
    >
      <span
        className="text-sm font-semibold tracking-tight"
        style={{ color: "var(--archik-fg)", letterSpacing: "0.01em" }}
      >
        Archik
      </span>
      <span
        className="text-xs"
        style={{ color: "var(--archik-fg-dim)" }}
      >
        {document.name}
      </span>
      {connectingFromName !== undefined && (
        <span className="archik-pill archik-pill--info">
          Connecting from <strong>{connectingFromName}</strong>
          <button
            type="button"
            onClick={onCancelConnect}
            className="underline hover:no-underline"
            style={{ color: "var(--archik-accent)" }}
          >
            cancel (Esc)
          </button>
        </span>
      )}
      {commandError !== undefined && (
        <span className="archik-pill archik-pill--danger">{commandError}</span>
      )}
      {reloadError !== undefined && (
        <span className="archik-pill archik-pill--warning" title={reloadError}>
          File reload error
        </span>
      )}
      {saveLabel !== null && (
        <span className={SAVE_VARIANT[saveStatus]}>{saveLabel}</span>
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
          className="archik-btn"
        >
          Download YAML
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty || saveStatus === "saving"}
          title={`Save to ${filename} (${shortcutHint})`}
          className="archik-btn archik-btn-primary"
        >
          {isDirty ? "Save •" : "Save"}
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
