import type { FileFrame } from "./App.tsx";

type Props = {
  /** The full navigation stack. The last frame is "current" — shown
   *  as plain text rather than a clickable button. */
  stack: ReadonlyArray<FileFrame>;
  /** Jump back to the frame at `index`. The component never invokes
   *  this for the last entry (already current). */
  onGoToFrame: (index: number) => void;
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
}: Props): React.ReactElement | null {
  if (stack.length <= 1) return null;
  return (
    <nav
      aria-label="Architecture file navigation"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 14px",
        fontSize: 12,
        background: "var(--archik-surface)",
        borderBottom: "1px solid var(--archik-border)",
        color: "var(--archik-fg-muted)",
      }}
    >
      {stack.map((frame, i) => {
        const isLast = i === stack.length - 1;
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
                }}
                aria-current="page"
              >
                {frame.label}
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
                }}
                title={`Back to ${frame.label}`}
              >
                {frame.label}
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
