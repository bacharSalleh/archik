type ZoomControlsProps = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
};

/**
 * Floating zoom button cluster (− / % / +) overlaid bottom-right on a
 * diagram. Shared by the architecture canvas and the sequence-diagram
 * page. Button sizing lives in `.archik-zoom-btn` so the coarse-pointer
 * media query can enlarge them on touch devices.
 */
export function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: ZoomControlsProps): React.ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        bottom: 12,
        display: "flex",
        gap: 4,
        padding: 4,
        background: "var(--archik-panel)",
        border: "1px solid var(--archik-border)",
        borderRadius: 6,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.18)",
      }}
    >
      <button
        type="button"
        onClick={onZoomOut}
        title="Zoom out"
        aria-label="Zoom out"
        className="archik-btn archik-zoom-btn"
      >
        −
      </button>
      <button
        type="button"
        onClick={onZoomReset}
        title="Reset zoom (100%)"
        aria-label="Reset zoom"
        className="archik-btn archik-zoom-btn"
        style={{ minWidth: 48 }}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        title="Zoom in"
        aria-label="Zoom in"
        className="archik-btn archik-zoom-btn"
      >
        +
      </button>
    </div>
  );
}
