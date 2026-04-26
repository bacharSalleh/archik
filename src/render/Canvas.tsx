import { useEffect, useMemo, useRef, useState } from "react";
import type { Document } from "../domain/types.ts";
import type { StatusMap } from "../domain/diff.ts";
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
  /** Fired when the user drags from one node and releases over another. */
  onConnectDrag?: (fromId: string, toId: string) => void;
  /** When set, layer diff frames + edge tints over the diagram (review mode). */
  diffStatuses?: StatusMap;
};

const DRAG_THRESHOLD_PX = 5;

type DragState =
  | { type: "idle" }
  | { type: "dragging"; from: string; pointerSvgX: number; pointerSvgY: number };

function svgPointFromClient(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

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
  onConnectDrag,
  diffStatuses,
}: Props): React.ReactElement {
  const layoutPromise = useMemo(
    () => layout(document, layoutOptions),
    [document, layoutOptions],
  );
  const [positioned, setPositioned] = useState<PositionedDocument | null>(null);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<DragState>({ type: "idle" });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // After a drag-connect, the click event still fires on the target node.
  // This flag is checked by a capture-phase click handler below to swallow
  // it, so the just-connected node doesn't get selected as a side effect.
  const swallowNextClick = useRef(false);

  useEffect(() => {
    let cancelled = false;
    layoutPromise.then((p) => {
      if (!cancelled) setPositioned(p);
    });
    return () => {
      cancelled = true;
    };
  }, [layoutPromise]);

  // Attach the wheel listener once the scroll container exists. Depending
  // on `positioned !== null` (a boolean) instead of the layout object
  // itself avoids re-adding the listener on every layout pass — which
  // happens on every keystroke in the inspector.
  const scrollMounted = positioned !== null;
  useEffect(() => {
    if (!scrollMounted) return;
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
  }, [scrollMounted]);

  // Capture-phase click swallower for the node that ends a drag-to-connect.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: MouseEvent): void => {
      if (swallowNextClick.current) {
        swallowNextClick.current = false;
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    el.addEventListener("click", handler, { capture: true });
    return () => el.removeEventListener("click", handler, { capture: true });
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    // Modifier-held clicks are reserved for multi-select / toggle.
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (!onConnectDrag) return;
    const target = e.target instanceof Element ? e.target : null;
    const nodeEl = target?.closest("[data-archik-node-id]");
    if (!nodeEl) return;
    const fromId = nodeEl.getAttribute("data-archik-node-id");
    if (!fromId) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let isDragging = false;

    // Window-level listeners are robust against React synthetic-event
    // batching, pointer-capture quirks, and the cursor briefly leaving
    // the scroll container during a fast drag.
    const handleMove = (ev: PointerEvent): void => {
      if (!isDragging) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        isDragging = true;
      }
      const svg = svgRef.current;
      if (!svg) return;
      const pt = svgPointFromClient(svg, ev.clientX, ev.clientY);
      setDrag({
        type: "dragging",
        from: fromId,
        pointerSvgX: pt.x,
        pointerSvgY: pt.y,
      });
    };

    const cleanup = (): void => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };

    const handleUp = (ev: PointerEvent): void => {
      cleanup();
      if (isDragging) {
        const dropEl = globalThis.document.elementFromPoint(
          ev.clientX,
          ev.clientY,
        );
        const targetEl = dropEl?.closest("[data-archik-node-id]");
        const toId = targetEl?.getAttribute("data-archik-node-id") ?? null;
        if (toId && toId !== fromId && onConnectDrag) {
          onConnectDrag(fromId, toId);
        }
        swallowNextClick.current = true;
      }
      setDrag({ type: "idle" });
    };

    const handleCancel = (): void => {
      cleanup();
      setDrag({ type: "idle" });
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
  };

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
        onPointerDown={handlePointerDown}
        onClick={(e) => {
          if (e.target === e.currentTarget && onSelectNothing) {
            onSelectNothing();
          }
        }}
        style={{
          width: "100%",
          height: "100%",
          overflow: "auto",
          display: "flex",
          justifyContent: "safe center",
          alignItems: "safe center",
        }}
      >
        <DiagramSvg
          positioned={positioned}
          zoom={zoom}
          viewMode={viewMode}
          svgRef={svgRef}
          dragGhost={
            drag.type === "dragging"
              ? {
                  fromId: drag.from,
                  pointerX: drag.pointerSvgX,
                  pointerY: drag.pointerSvgY,
                }
              : null
          }
          {...(selectedNodeIds !== undefined ? { selectedNodeIds } : {})}
          {...(selectedEdgeIds !== undefined ? { selectedEdgeIds } : {})}
          {...(onSelectNode !== undefined ? { onSelectNode } : {})}
          {...(onSelectEdge !== undefined ? { onSelectEdge } : {})}
          {...(onSelectNothing !== undefined ? { onSelectNothing } : {})}
          {...(diffStatuses !== undefined ? { diffStatuses } : {})}
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
