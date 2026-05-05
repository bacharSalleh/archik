import { GitBranch, LayoutGrid, Redo2, Rows3, Undo2 } from "lucide-react";
import type { Document, NodeKind } from "../domain/types.ts";
import type { ViewMode } from "../layout/types.ts";
import { AddNodeForm } from "./AddNodeForm.tsx";
import { AlphasPanel } from "./AlphasPanel.tsx";
import { ExportMenu } from "./ExportMenu.tsx";
import { LayoutControls } from "./LayoutControls.tsx";
import { Legend } from "./Legend.tsx";
import { Logo } from "./Logo.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { UseCasesPanel } from "./UseCasesPanel.tsx";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  document: Document;
  filename?: string;
  commandError?: string | undefined;
  reloadError?: string | undefined;
  saveStatus?: SaveStatus;
  /** Server-side validation message when a PUT was rejected (e.g.
   *  "missing required sourcePath"). Surfaced via title=tooltip on
   *  the Save-failed pill so the user can read why the save was
   *  refused without opening devtools. */
  saveError?: string | undefined;
  isDirty?: boolean;
  onSave?: () => void;
  onAddNode?: (kind: NodeKind, name: string, description: string) => void;
  connectingFromName?: string;
  onCancelConnect?: () => void;
  density?: number;
  onDensityChange?: (value: number) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (value: ViewMode) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Returns the live canvas <svg> for SVG / PNG export. */
  getSvg?: () => SVGSVGElement | null;
  seqHighlight?: boolean;
  onToggleSeqHighlight?: () => void;
  seqNodeCount?: number;
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
  saveError,
  isDirty = false,
  onSave,
  onAddNode,
  connectingFromName,
  onCancelConnect,
  density,
  onDensityChange,
  viewMode,
  onViewModeChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  getSvg,
  seqHighlight,
  onToggleSeqHighlight,
  seqNodeCount,
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
        <span
          className={SAVE_VARIANT[saveStatus]}
          {...(saveStatus === "error" && saveError !== undefined
            ? { title: saveError }
            : {})}
        >
          {saveLabel}
        </span>
      )}
      {saveStatus === "error" && saveError !== undefined && (
        <span
          className="archik-pill archik-pill--danger"
          style={{
            maxWidth: 480,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
          }}
          title={saveError}
        >
          {firstLine(saveError)}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {onUndo !== undefined && (
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title={`Undo (${shortcutHint.replace("S", "Z")})`}
            aria-label="Undo"
            className="archik-btn"
            style={{ padding: "5px 8px" }}
          >
            <Undo2 size={14} strokeWidth={1.8} />
          </button>
        )}
        {onRedo !== undefined && (
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title={`Redo (${shortcutHint.replace("S", "⇧Z").replace("Ctrl+", "Ctrl+Shift+")})`}
            aria-label="Redo"
            className="archik-btn"
            style={{ padding: "5px 8px" }}
          >
            <Redo2 size={14} strokeWidth={1.8} />
          </button>
        )}
        {onAddNode !== undefined && <AddNodeForm onAdd={onAddNode} />}
        {viewMode !== undefined && onViewModeChange !== undefined && (
          <button
            type="button"
            onClick={() =>
              onViewModeChange(viewMode === "compact" ? "detailed" : "compact")
            }
            title={
              viewMode === "compact"
                ? "Switch to detailed view"
                : "Switch to compact view"
            }
            aria-label="Toggle view mode"
            className="archik-btn"
            style={{ padding: "5px 8px" }}
          >
            {viewMode === "compact" ? (
              <LayoutGrid size={14} strokeWidth={1.8} />
            ) : (
              <Rows3 size={14} strokeWidth={1.8} />
            )}
          </button>
        )}
        {density !== undefined && onDensityChange !== undefined && (
          <LayoutControls density={density} onChange={onDensityChange} />
        )}
        {onToggleSeqHighlight !== undefined && (seqNodeCount ?? 0) > 0 && (
          <button
            type="button"
            onClick={onToggleSeqHighlight}
            title={seqHighlight ? "Hide sequence diagram highlights" : `Show ${seqNodeCount} node${seqNodeCount === 1 ? "" : "s"} with sequence diagrams`}
            aria-label="Toggle sequence diagram highlights"
            aria-pressed={seqHighlight}
            className="archik-btn"
            style={{
              padding: "5px 8px",
              ...(seqHighlight ? {
                background: "var(--archik-status-proposed)",
                borderColor: "var(--archik-status-proposed)",
                color: "white",
              } : {}),
            }}
          >
            <GitBranch size={14} strokeWidth={1.8} />
          </button>
        )}
        <UseCasesPanel />
        <AlphasPanel />
        <Legend />
        <ExportMenu
          document={document}
          filename={filename}
          {...(getSvg !== undefined ? { getSvg } : {})}
        />
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

/** Strip everything after the first newline so a multi-line server
 *  validation message fits in the toolbar pill; the full message
 *  remains accessible via the title=tooltip. */
function firstLine(s: string): string {
  const i = s.indexOf("\n");
  return i === -1 ? s : s.slice(0, i);
}
