import { useEffect } from "react";
import { midpoint, pinchDistance, zoomFromPinch } from "./pinch.ts";

/**
 * Pinch-to-zoom + two-finger pan for a scrollable diagram container.
 * Single-finger pan is left to the browser's native scrolling (the
 * container should have `touch-action: pan-x pan-y`); the moment a
 * second finger lands we own the gesture and preventDefault every
 * touchmove so the browser neither scrolls nor page-zooms out from
 * under us. Listeners are native (not React pointer events) because
 * passive:false is required to cancel the gesture.
 *
 * Shared by the architecture canvas and the sequence-diagram page.
 */
export function usePinchZoom(args: {
  scrollRef: React.RefObject<HTMLElement | null>;
  /** Reads the current zoom — avoids stale closure values mid-gesture. */
  zoomRef: React.RefObject<number>;
  setZoom: (zoom: number) => void;
  min: number;
  max: number;
  /** Attach only once the scroll container exists. */
  enabled: boolean;
}): void {
  const { scrollRef, zoomRef, setZoom, min, max, enabled } = args;
  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;
    let startDist = 0;
    let startZoom = 1;
    let lastMid: { x: number; y: number } | null = null;

    const pointOf = (t: Touch): { x: number; y: number } => ({
      x: t.clientX,
      y: t.clientY,
    });

    const handleStart = (e: TouchEvent): void => {
      if (e.touches.length === 2) {
        const a = pointOf(e.touches[0]!);
        const b = pointOf(e.touches[1]!);
        startDist = pinchDistance(a, b);
        startZoom = zoomRef.current;
        lastMid = midpoint(a, b);
      } else {
        lastMid = null;
      }
    };
    const handleMove = (e: TouchEvent): void => {
      if (e.touches.length !== 2 || lastMid === null) return;
      e.preventDefault();
      const a = pointOf(e.touches[0]!);
      const b = pointOf(e.touches[1]!);
      const dist = pinchDistance(a, b);
      setZoom(zoomFromPinch(startDist, dist, startZoom, min, max));
      const mid = midpoint(a, b);
      el.scrollLeft -= mid.x - lastMid.x;
      el.scrollTop -= mid.y - lastMid.y;
      lastMid = mid;
    };
    const handleEnd = (e: TouchEvent): void => {
      if (e.touches.length < 2) lastMid = null;
    };

    el.addEventListener("touchstart", handleStart, { passive: true });
    el.addEventListener("touchmove", handleMove, { passive: false });
    el.addEventListener("touchend", handleEnd, { passive: true });
    el.addEventListener("touchcancel", handleEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleStart);
      el.removeEventListener("touchmove", handleMove);
      el.removeEventListener("touchend", handleEnd);
      el.removeEventListener("touchcancel", handleEnd);
    };
  }, [scrollRef, zoomRef, setZoom, min, max, enabled]);
}
