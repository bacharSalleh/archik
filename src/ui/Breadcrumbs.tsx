import type { FileFrame } from "./App.tsx";
import { SuggestionDot } from "./FileSwitcher.tsx";

type Props = {
  /** The full navigation stack. The last frame is "current" — shown
   *  as plain text rather than a clickable button. */
  stack: ReadonlyArray<FileFrame>;
  /** Jump back to the frame at `index`. The component never invokes
   *  this for the last entry (already current). */
  onGoToFrame: (index: number) => void;
  /** Set of paths (matching `FileEntry.path`) that have pending
   *  suggestion sidecars. Used to render an accent dot next to the
   *  matching crumb. */
  suggestionsByPath?: ReadonlySet<string>;
};

/**
 * Breadcrumb bar at the top of the canvas. Hidden when the stack
 * has only the root frame (no drill-down) — there's nothing useful
 * to show in that case. Each crumb except the last is a clickable
 * button that pops the stack to that depth.
 */
export function Breadcrumbs({
  stack,
  onGoToFrame,
  suggestionsByPath,
}: Props): React.ReactElement | null {
  if (stack.length <= 1) return null;
  return (
    <nav
      aria-label="Architecture file navigation"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--archik-fg-muted)",
      }}
    >
      {stack.map((frame, i) => {
        const isLast = i === stack.length - 1;
        const hasSuggestion =
          frame.archikFile !== null &&
          suggestionsByPath !== undefined &&
          suggestionsByPath.has(frame.archikFile);
        return (
          <span
            key={`${i}-${frame.archikFile ?? "root"}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {isLast ? (
              <span
                style={{
                  color: "var(--archik-fg)",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
                aria-current="page"
              >
                {frame.label}
                {hasSuggestion && <SuggestionDot />}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onGoToFrame(i)}
                className="archik-btn"
                style={{
                  padding: "2px 6px",
                  fontSize: 12,
                  color: "var(--archik-fg-muted)",
                  background: "transparent",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
                title={`Back to ${frame.label}`}
              >
                {frame.label}
                {hasSuggestion && <SuggestionDot />}
              </button>
            )}
            {!isLast && (
              <span aria-hidden="true" style={{ opacity: 0.5 }}>
                ›
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
