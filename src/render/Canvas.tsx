import { useEffect, useMemo, useRef, useState } from "react";
import type { Document } from "../domain/types.ts";
import type { PositionedDocument } from "../layout/types.ts";
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
  selectedNodeId?: string | undefined;
  selectedEdgeId?: string | undefined;
  onSelectNode?: ((id: string) => void) | undefined;
  onSelectEdge?: ((id: string) => void) | undefined;
  onSelectNothing?: (() => void) | undefined;
};

export function Canvas({
  document,
  className,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  onSelectNothing,
}: Props): React.ReactElement {
  const layoutPromise = useMemo(() => layout(document), [document]);
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
        style={{
          width: "100%",
          height: "100%",
          overflow: "auto",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <DiagramSvg
          positioned={positioned}
          zoom={zoom}
          {...(selectedNodeId !== undefined ? { selectedNodeId } : {})}
          {...(selectedEdgeId !== undefined ? { selectedEdgeId } : {})}
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
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 6,
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
      }}
    >
      <button
        type="button"
        onClick={onZoomOut}
        title="Zoom out"
        aria-label="Zoom out"
        style={zoomButtonStyle}
      >
        −
      </button>
      <button
        type="button"
        onClick={onZoomReset}
        title="Reset zoom (100%)"
        aria-label="Reset zoom"
        style={{ ...zoomButtonStyle, minWidth: 48 }}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        title="Zoom in"
        aria-label="Zoom in"
        style={zoomButtonStyle}
      >
        +
      </button>
    </div>
  );
}

const zoomButtonStyle: React.CSSProperties = {
  minWidth: 28,
  height: 24,
  padding: "0 8px",
  fontSize: 12,
  color: "#334155",
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 4,
  cursor: "pointer",
};
