import { ChevronDown, FolderTree } from "lucide-react";
import { Popover } from "./Popover.tsx";

export type FileEntry = {
  /** Path relative to the project root, e.g. ".archik/orders.archik.yaml". */
  path: string;
  /** Friendly label — basename without extensions, "main" for the legacy root. */
  name: string;
  /** A `<stem>.suggested.yaml` is sitting next to this file. */
  hasSuggestion: boolean;
  /** True for the file `resolveDocPath` picked as canonical. The
   *  canvas accesses this one via the stable /architecture.archik.yaml
   *  URL; every other file via the per-file endpoint. */
  isRoot: boolean;
  /** True when only the suggestion sidecar exists on disk — there's
   *  no sibling main file yet. The canvas renders these distinctly
   *  ("(pending)" label) so the user can review before accepting. */
  isOrphanSuggestion?: boolean;
  /** True for `*.archik.discussion.yaml` files — exploratory /
   *  greenfield drafts. Rendered with a distinct badge so the user
   *  knows they're not the canonical architecture. */
  isDiscussion?: boolean;
};

type Props = {
  /** Every archik file under the project root. */
  files: ReadonlyArray<FileEntry>;
  /** Path of the file currently loaded — null when the root is the
   *  legacy file (its path comes back from the server as
   *  "architecture.archik.yaml" but the canvas references it via
   *  the stable URL, so we match by the empty-archikFile case). */
  currentPath: string | null;
  /** Switch to the chosen peer file. The canvas resets its
   *  navigation stack so the user lands at the root of that file. */
  onSwitchFile: (file: FileEntry) => void;
};

/**
 * Dropdown listing every archik file in the project, plus any
 * orphan suggestion sidecars (a `*.archik.suggested.yaml` whose
 * sibling main file doesn't exist yet — typically a brand-new
 * sub-architecture proposed by `/archik:spawn`). The dropdown is
 * suppressed only when there's a single real file AND no pending
 * suggestions of any kind — otherwise the user needs a way to see
 * orphans, and a single-file project with one orphan suggestion
 * would otherwise hide the only thing they need to act on.
 *
 * Each file entry shows an accent-coloured dot when a sidecar is
 * pending; orphans additionally get a "(pending)" suffix on the
 * name and a dashed left border so they read as "doesn't exist
 * yet, awaiting your decision".
 */
export function FileSwitcher({
  files,
  currentPath,
  onSwitchFile,
}: Props): React.ReactElement | null {
  const hasAnySuggestion = files.some(
    (f) => f.hasSuggestion || f.isOrphanSuggestion,
  );
  if (files.length <= 1 && !hasAnySuggestion) return null;
  const current =
    files.find((f) => f.path === currentPath) ?? files[0]!;

  return (
    <Popover
      align="start"
      trigger={(open) => (
        <button
          type="button"
          aria-label="Switch architecture file"
          aria-expanded={open}
          className="archik-btn"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            fontSize: 12,
            background: "transparent",
            color: "var(--archik-fg)",
          }}
        >
          <FolderTree size={13} strokeWidth={1.8} />
          <span style={{ fontWeight: 600 }}>{current.name}</span>
          {current.hasSuggestion && <SuggestionDot />}
          <ChevronDown size={12} strokeWidth={2} style={{ opacity: 0.6 }} />
        </button>
      )}
    >
      {(close) => (
        <div style={{ minWidth: 220, padding: 4 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--archik-fg-muted)",
              padding: "6px 10px 4px",
            }}
          >
            Architecture files
          </div>
          {files.map((file) => {
            const isCurrent = file.path === current.path;
            const isOrphan = file.isOrphanSuggestion === true;
            const isDiscussion = file.isDiscussion === true;
            return (
              <button
                key={file.path}
                type="button"
                title={
                  isOrphan
                    ? `Pending sub-architecture (sidecar only — no main file yet). Click to view; accept via \`npx archik suggest accept ${file.path.replace(/\.archik\.suggested\.yaml$/, ".archik.yaml")}\` to promote it, or /archik:accept.`
                    : isDiscussion
                      ? "Discussion file — exploratory / greenfield draft. sourcePath rules are relaxed."
                      : undefined
                }
                onClick={() => {
                  close();
                  if (isCurrent) return;
                  onSwitchFile(file);
                }}
                className="archik-menu-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 10px",
                  fontSize: 12,
                  background: isCurrent
                    ? "var(--archik-surface-hover)"
                    : undefined,
                  // Dashed left border distinguishes orphan suggestions
                  // (sub-architectures that don't exist yet) from real
                  // files. Same idea as the canvas's "added" overlay.
                  borderLeft: isOrphan
                    ? "2px dashed var(--archik-accent)"
                    : undefined,
                  paddingLeft: isOrphan ? 8 : undefined,
                }}
              >
                <span
                  style={{
                    fontWeight: isCurrent ? 600 : 400,
                    color: isCurrent ? "var(--archik-fg)" : "var(--archik-fg)",
                  }}
                >
                  {file.name}
                  {isOrphan && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 10,
                        fontWeight: 500,
                        color: "var(--archik-accent)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      (pending)
                    </span>
                  )}
                  {isDiscussion && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 10,
                        fontWeight: 500,
                        color: "var(--archik-fg-muted)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      (discussion)
                    </span>
                  )}
                </span>
                {file.hasSuggestion && !isOrphan && <SuggestionDot />}
                <span
                  style={{
                    flex: 1,
                    fontSize: 10,
                    fontFamily: "ui-monospace, monospace",
                    color: "var(--archik-fg-muted)",
                    textAlign: "right",
                  }}
                >
                  {file.path}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

export function SuggestionDot(): React.ReactElement {
  return (
    <span
      aria-label="pending suggestion"
      title="Pending suggestion"
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        background: "var(--archik-accent)",
        flexShrink: 0,
      }}
    />
  );
}
