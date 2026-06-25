import {
  Crosshair,
  EyeOff,
  GitBranch,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Redo2,
  Rows3,
  Stamp,
  Undo2,
  X,
} from "lucide-react";
import type { Document, NodeKind } from "../domain/types.ts";
import type { ViewMode } from "../layout/types.ts";
import { AddNodeForm } from "./AddNodeForm.tsx";
import { AlphasPanel } from "./AlphasPanel.tsx";
import { ExportMenu } from "./ExportMenu.tsx";
import { LayoutControls } from "./LayoutControls.tsx";
import { Legend } from "./Legend.tsx";
import { Logo } from "./Logo.tsx";
import { SearchBox } from "./SearchBox.tsx";
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
  /** Current state of the ECB stereotype band overlay. When `undefined`
   *  the toggle button is hidden — embedders that don't expose ECB
   *  controls just don't pass it. */
  showStereotypeBands?: boolean;
  onToggleStereotypeBands?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Returns the live canvas <svg> for SVG / PNG export. */
  getSvg?: () => SVGSVGElement | null;
  seqHighlight?: boolean;
  onToggleSeqHighlight?: () => void;
  seqNodeCount?: number;
  /** Canvas view: hide structural (weak) edges. When the toggle handler
   *  is undefined the button is hidden. */
  hideStructural?: boolean;
  onToggleHideStructural?: () => void;
  /** Collapse / expand every container node on the canvas (view-only). */
  onCollapseAll?: () => void;
  onExpandAll?: () => void;
  /** Focus depth stepper — only rendered while focus mode is active
   *  (focusDepth + its handlers all provided). */
  focusDepth?: number;
  onFocusDepthChange?: (depth: number) => void;
  onClearFocus?: () => void;
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
  showStereotypeBands,
  onToggleStereotypeBands,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  getSvg,
  seqHighlight,
  onToggleSeqHighlight,
  seqNodeCount,
  hideStructural,
  onToggleHideStructural,
  onCollapseAll,
  onExpandAll,
  focusDepth,
  onFocusDepthChange,
  onClearFocus,
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
        <SearchBox document={document} />
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
        {showStereotypeBands !== undefined &&
          onToggleStereotypeBands !== undefined && (
            <button
              type="button"
              onClick={onToggleStereotypeBands}
              title={
                showStereotypeBands
                  ? "Hide ECB stereotype bands"
                  : "Show ECB stereotype bands (boundary / control / entity)"
              }
              aria-label="Toggle ECB stereotype bands"
              aria-pressed={showStereotypeBands}
              className="archik-btn"
              style={{
                padding: "5px 8px",
                ...(showStereotypeBands
                  ? {
                      background: "var(--archik-stereotype-control)",
                      borderColor: "var(--archik-stereotype-control)",
                      color: "white",
                    }
                  : {}),
              }}
            >
              <Stamp size={14} strokeWidth={1.8} />
            </button>
          )}
        {onToggleHideStructural !== undefined && (
          <button
            type="button"
            onClick={onToggleHideStructural}
            title={
              hideStructural
                ? "Show weak edges"
                : "Hide weak edges (uses / depends_on / has_a / implements / extends)"
            }
            aria-label="Hide weak edges"
            aria-pressed={hideStructural}
            className="archik-btn"
            style={{
              padding: "5px 8px",
              ...(hideStructural
                ? {
                    background: "var(--archik-accent)",
                    borderColor: "var(--archik-accent)",
                    color: "white",
                  }
                : {}),
            }}
          >
            <EyeOff size={14} strokeWidth={1.8} />
          </button>
        )}
        {onCollapseAll !== undefined && (
          <button
            type="button"
            onClick={onCollapseAll}
            title="Collapse all containers"
            aria-label="Collapse all"
            className="archik-btn"
            style={{ padding: "5px 8px" }}
          >
            <Minimize2 size={14} strokeWidth={1.8} />
          </button>
        )}
        {onExpandAll !== undefined && (
          <button
            type="button"
            onClick={onExpandAll}
            title="Expand all containers"
            aria-label="Expand all"
            className="archik-btn"
            style={{ padding: "5px 8px" }}
          >
            <Maximize2 size={14} strokeWidth={1.8} />
          </button>
        )}
        {focusDepth !== undefined &&
          onFocusDepthChange !== undefined &&
          onClearFocus !== undefined && (
            <div
              role="group"
              aria-label="Focus mode"
              className="archik-focus-control"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                height: 28,
                padding: "0 4px",
                borderRadius: 7,
                border: "1px solid var(--archik-accent)",
                background:
                  "color-mix(in srgb, var(--archik-accent) 12%, var(--archik-panel))",
              }}
            >
              <Crosshair
                size={13}
                strokeWidth={2}
                style={{ color: "var(--archik-accent)" }}
                aria-hidden="true"
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                  color: "var(--archik-accent)",
                  marginRight: 2,
                }}
              >
                Focus
              </span>
              <button
                type="button"
                aria-label="Decrease focus depth"
                title="Show fewer hops"
                disabled={focusDepth <= 0}
                onClick={() => onFocusDepthChange(Math.max(0, focusDepth - 1))}
                className="archik-focus-step"
              >
                <Minus size={13} strokeWidth={2} />
              </button>
              <span
                className="archik-mono"
                aria-label={`Focus depth ${focusDepth}`}
                style={{
                  minWidth: 16,
                  textAlign: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--archik-fg)",
                }}
              >
                {focusDepth}
              </span>
              <button
                type="button"
                aria-label="Increase focus depth"
                title="Show more hops"
                onClick={() => onFocusDepthChange(focusDepth + 1)}
                className="archik-focus-step"
              >
                <Plus size={13} strokeWidth={2} />
              </button>
              <span
                aria-hidden="true"
                style={{
                  width: 1,
                  height: 16,
                  margin: "0 2px",
                  background: "var(--archik-border)",
                }}
              />
              <button
                type="button"
                aria-label="Clear focus"
                title="Clear focus (Esc)"
                onClick={onClearFocus}
                className="archik-focus-step"
              >
                <X size={13} strokeWidth={2} />
              </button>
            </div>
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
