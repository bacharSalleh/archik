import { useEffect, useMemo, useRef, useState } from "react";
import type { Document } from "../domain/types.ts";
import type {
  LayoutOptions,
  PositionedDocument,
  ViewMode,
} from "../layout/types.ts";
import { layout } from "../layout/index.ts";
import { DiagramSvg } from "./DiagramSvg.tsx";

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.2;
const clampZoom = (z: number): number =>
  Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

type Props = {
  document: Document;
  className?: string | undefined;
  layoutOptions?: LayoutOptions;
  viewMode?: ViewMode;
  selectedNodeIds?: ReadonlySet<string>;
  selectedEdgeIds?: ReadonlySet<string>;
  onSelectNode?:
    | ((id: string, event: React.MouseEvent) => void)
    | undefined;
  onSelectEdge?:
    | ((id: string, event: React.MouseEvent) => void)
    | undefined;
  onSelectNothing?: (() => void) | undefined;
};

export function Canvas({
  document,
  className,
  layoutOptions,
  viewMode = "detailed",
  selectedNodeIds,
  selectedEdgeIds,
  onSelectNode,
  onSelectEdge,
  onSelectNothing,
}: Props): React.ReactElement {
  const layoutPromise = useMemo(
    () => layout(document, layoutOptions),
    [document, layoutOptions],
  );
  const [positioned, setPositioned] = useState<PositionedDocument | null>(null);
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    layoutPromise.then((p) => {
      if (!cancelled) setPositioned(p);
    });
    return () => {
      cancelled = true;
    };
  }, [layoutPromise]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      setZoom((z) => clampZoom(z * factor));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [positioned]);

  if (!positioned) {
    return (
      <div
        className={className}
        role="status"
        aria-live="polite"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          color: "#64748b",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 13,
        }}
      >
        Laying out…
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{ position: "relative", overflow: "hidden" }}
    >
      <div
        ref={scrollRef}
        onClick={(e) => {
          // Only fire deselect when the click landed on the scroll container
          // itself, not on a node/edge inside the SVG (those stopPropagation).
          if (e.target === e.currentTarget && onSelectNothing) {
            onSelectNothing();
          }
        }}
        style={{
          width: "100%",
          height: "100%",
          overflow: "auto",
          display: "flex",
          // "safe center" centers when the content fits but falls back to
          // start alignment when it overflows, so scrollbars can reach
          // everything (plain "center" clips the leading overflow).
          justifyContent: "safe center",
          alignItems: "safe center",
        }}
      >
        <DiagramSvg
          positioned={positioned}
          zoom={zoom}
          viewMode={viewMode}
          {...(selectedNodeIds !== undefined ? { selectedNodeIds } : {})}
          {...(selectedEdgeIds !== undefined ? { selectedEdgeIds } : {})}
          {...(onSelectNode !== undefined ? { onSelectNode } : {})}
          {...(onSelectEdge !== undefined ? { onSelectEdge } : {})}
          {...(onSelectNothing !== undefined ? { onSelectNothing } : {})}
        />
      </div>
      <ZoomControls
        zoom={zoom}
        onZoomIn={() => setZoom((z) => clampZoom(z * ZOOM_STEP))}
        onZoomOut={() => setZoom((z) => clampZoom(z / ZOOM_STEP))}
        onZoomReset={() => setZoom(1)}
      />
    </div>
  );
}

type ZoomControlsProps = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
};

function ZoomControls({
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
        className="archik-btn"
        style={{ minWidth: 28, padding: "0 8px", height: 24 }}
      >
        −
      </button>
      <button
        type="button"
        onClick={onZoomReset}
        title="Reset zoom (100%)"
        aria-label="Reset zoom"
        className="archik-btn"
        style={{ minWidth: 48, padding: "0 8px", height: 24 }}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        title="Zoom in"
        aria-label="Zoom in"
        className="archik-btn"
        style={{ minWidth: 28, padding: "0 8px", height: 24 }}
      >
        +
      </button>
    </div>
  );
}
