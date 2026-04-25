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
  /** Fired when the user drags from one node and releases over another. */
  onConnectDrag?: (fromId: string, toId: string) => void;
};

const DRAG_THRESHOLD_PX = 5;

type DragState =
  | { type: "idle" }
  | { type: "potential"; from: string; startX: number; startY: number }
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
}: Props): React.ReactElement {
  const layoutPromise = useMemo(
    () => layout(document, layoutOptions),
    [document, layoutOptions],
  );
  const [positioned, setPositioned] = useState<PositionedDocument | null>(null);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<DragState>({ type: "idle" });
  // Mirror of `drag` for synchronous reads inside pointer handlers — React
  // state batching means the closure may still see "idle" between
  // pointerdown and the next pointermove without this ref.
  const dragRef = useRef<DragState>({ type: "idle" });
  const setDragBoth = (next: DragState): void => {
    dragRef.current = next;
    setDrag(next);
  };
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // After a drag-connect, the click event still fires on the target node.
  // This flag is checked by a capture-phase click handler below to swallow
  // it, so the just-connected node doesn't get selected as a side effect.
  const swallowNextClick = useRef(false);
  // Track the active pointer so we can release capture on pointerup.
  const activePointerRef = useRef<number | null>(null);

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
    // Capture the pointer so move / up events keep arriving even if the
    // cursor briefly leaves the scroll container during a fast drag.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
      activePointerRef.current = e.pointerId;
    } catch {
      // Pointer capture not supported / already captured — non-fatal.
    }
    setDragBoth({
      type: "potential",
      from: fromId,
      startX: e.clientX,
      startY: e.clientY,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const current = dragRef.current;
    if (current.type === "idle") return;
    const svg = svgRef.current;
    if (current.type === "potential") {
      const dx = e.clientX - current.startX;
      const dy = e.clientY - current.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      if (!svg) return;
      const pt = svgPointFromClient(svg, e.clientX, e.clientY);
      setDragBoth({
        type: "dragging",
        from: current.from,
        pointerSvgX: pt.x,
        pointerSvgY: pt.y,
      });
      return;
    }
    if (!svg) return;
    const pt = svgPointFromClient(svg, e.clientX, e.clientY);
    setDragBoth({
      type: "dragging",
      from: current.from,
      pointerSvgX: pt.x,
      pointerSvgY: pt.y,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    const current = dragRef.current;
    if (activePointerRef.current !== null) {
      try {
        e.currentTarget.releasePointerCapture(activePointerRef.current);
      } catch {
        // ignore
      }
      activePointerRef.current = null;
    }
    if (current.type === "dragging") {
      // elementFromPoint is more reliable than e.target during a captured
      // drag — the captured element receives the event, but we need the
      // element actually under the cursor to find the drop target.
      const dropEl = globalThis.document.elementFromPoint(
        e.clientX,
        e.clientY,
      );
      const targetEl = dropEl?.closest("[data-archik-node-id]");
      const toId = targetEl?.getAttribute("data-archik-node-id") ?? null;
      if (toId && toId !== current.from && onConnectDrag) {
        onConnectDrag(current.from, toId);
      }
      swallowNextClick.current = true;
    }
    setDragBoth({ type: "idle" });
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
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          activePointerRef.current = null;
          setDragBoth({ type: "idle" });
        }}
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
