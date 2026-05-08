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
  /** Toggle for the ECB stereotype band overlay. Forwarded to DiagramSvg. */
  showStereotypeBands?: boolean;
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
  /** Drill into a node's sub-architecture. The canvas wires this to
   *  the per-node "↓ open" affordance; only nodes with `archikFile`
   *  expose it. */
  onOpenSubFile?: (archikFile: string, label: string) => void;
  /** Lateral navigation callback for cross-file edge badges. When
   *  omitted the canvas falls back to onOpenSubFile so older callers
   *  still get *something* on click — but the breadcrumb behaviour
   *  is then "drill-down" semantics, which isn't what cross-file
   *  edges want. Pass both. */
  onCrossFileNavigate?: (archikFile: string, label: string) => void;
  /** Identity for the currently-loaded file. When this changes the
   *  canvas saves the current zoom + scroll for the OLD key into an
   *  in-memory map, then restores whatever state was last saved for
   *  the new key (or defaults if first visit). Lets the user navigate
   *  between architecture files without losing their place. */
  viewKey?: string;
  /** When set, layer diff frames + edge tints over the diagram (review mode). */
  diffStatuses?: StatusMap;
  glowNodeIds?: ReadonlySet<string>;
  /** Optional external ref so callers (App, ExportMenu) can reach the
   *  rendered <svg> for snapshot / export. When omitted, Canvas keeps
   *  its own internal ref and nothing changes. */
  svgRef?: React.RefObject<SVGSVGElement | null>;
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
  showStereotypeBands = true,
  selectedNodeIds,
  selectedEdgeIds,
  onSelectNode,
  onSelectEdge,
  onSelectNothing,
  onConnectDrag,
  onOpenSubFile,
  onCrossFileNavigate,
  viewKey,
  diffStatuses,
  glowNodeIds,
  svgRef: externalSvgRef,
}: Props): React.ReactElement {
  const layoutPromise = useMemo(
    () => layout(document, layoutOptions),
    [document, layoutOptions],
  );
  const [positioned, setPositioned] = useState<PositionedDocument | null>(null);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<DragState>({ type: "idle" });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const internalSvgRef = useRef<SVGSVGElement | null>(null);
  // Caller-provided refs take precedence; the internal one is kept as
  // a fallback so the rest of Canvas (drag math, getScreenCTM, etc.)
  // doesn't have to special-case its absence.
  const svgRef = externalSvgRef ?? internalSvgRef;
  // Per-file view state. The cleanup of the viewKey effect captures
  // the *previous* key, so we save the old file's pose just as the
  // user navigates away. zoomRef keeps the cleanup reading the latest
  // zoom rather than the value at effect-schedule time.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const viewStatesRef = useRef<
    Map<string, { zoom: number; scrollX: number; scrollY: number }>
  >(new Map());
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

  // Save the viewport state for the OLD viewKey when it changes, via
  // the effect's cleanup function. Keeps each file's pose around so
  // returning to it restores zoom + scroll.
  useEffect(() => {
    if (viewKey === undefined) return;
    const key = viewKey;
    return () => {
      const el = scrollRef.current;
      viewStatesRef.current.set(key, {
        zoom: zoomRef.current,
        scrollX: el?.scrollLeft ?? 0,
        scrollY: el?.scrollTop ?? 0,
      });
    };
  }, [viewKey]);

  // Restore (or default) for the NEW viewKey once layout is ready.
  // Doing this only after `positioned` is set ensures the scroll
  // container has its real content size, otherwise scrollLeft/scrollTop
  // get clamped to 0.
  const positionedReady = positioned !== null;
  useEffect(() => {
    if (viewKey === undefined || !positionedReady) return;
    const saved = viewStatesRef.current.get(viewKey);
    if (saved) {
      setZoom(saved.zoom);
    } else {
      setZoom(1);
    }
    // Restore scroll on the next frame so the SVG has rendered at the
    // chosen zoom — otherwise the scrollable area doesn't yet match
    // the saved offsets and the browser clamps them.
    const raf = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollLeft = saved?.scrollX ?? 0;
      el.scrollTop = saved?.scrollY ?? 0;
    });
    return () => cancelAnimationFrame(raf);
  }, [viewKey, positionedReady]);

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
          showStereotypeBands={showStereotypeBands}
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
          {...(onOpenSubFile !== undefined ? { onOpenSubFile } : {})}
          {...(onCrossFileNavigate !== undefined
            ? { onCrossFileNavigate }
            : {})}
          {...(diffStatuses !== undefined ? { diffStatuses } : {})}
          {...(glowNodeIds !== undefined ? { glowNodeIds } : {})}
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
