import type { Document, NodeKind } from "../domain/types.ts";
import { AddNodeForm } from "./AddNodeForm.tsx";
import { ExportMenu } from "./ExportMenu.tsx";
import { LayoutControls } from "./LayoutControls.tsx";
import { Legend } from "./Legend.tsx";
import { Logo } from "./Logo.tsx";
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
  density?: number;
  onDensityChange?: (value: number) => void;
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
  density,
  onDensityChange,
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
      <div className="flex items-center gap-2">
        <Logo />
        <span
          className="text-sm font-semibold tracking-tight"
          style={{ color: "var(--archik-fg)", letterSpacing: "0.02em" }}
        >
          Archik
        </span>
      </div>
      <span
        className="archik-mono"
        style={{
          color: "var(--archik-fg-dim)",
          fontSize: 11,
          opacity: 0.85,
        }}
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
        {density !== undefined && onDensityChange !== undefined && (
          <LayoutControls density={density} onChange={onDensityChange} />
        )}
        <Legend />
        <ExportMenu document={document} filename={filename} />
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
