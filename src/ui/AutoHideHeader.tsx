import { useCallback, useEffect, useRef, useState } from "react";

const PIN_KEY = "archik-header-pinned";
const HIDE_DELAY_MS = 450;

export function loadHeaderPinned(): boolean {
  try {
    return localStorage.getItem(PIN_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveHeaderPinned(value: boolean): void {
  try {
    localStorage.setItem(PIN_KEY, value ? "true" : "false");
  } catch {
    // private window / blocked storage — the choice lasts this session
  }
}

/**
 * The header lives on top of a full-bleed canvas. Unpinned, it hides
 * and slides in when the pointer reaches the top edge (or focus moves
 * into it, e.g. the "/" search shortcut). It stays out while a menu in
 * it is open or while `forceVisible` is set (unsaved changes, errors).
 * Pinned — and always on touch screens and narrow windows, see
 * index.css — it is a normal bar above the canvas.
 */
export function AutoHideHeader({
  pinned,
  forceVisible,
  children,
}: {
  pinned: boolean;
  forceVisible: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = (): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = useCallback((): void => {
    cancelHide();
    setHovered(true);
  }, []);
  const scheduleHide = useCallback((): void => {
    cancelHide();
    timer.current = setTimeout(function check() {
      // An open menu keeps the header out until it closes.
      if (ref.current?.querySelector('[aria-expanded="true"]')) {
        timer.current = setTimeout(check, HIDE_DELAY_MS);
        return;
      }
      setHovered(false);
    }, HIDE_DELAY_MS);
  }, []);
  useEffect(() => cancelHide, []);

  const visible = pinned || forceVisible || hovered || focused;
  return (
    <div className={`archik-header-host${pinned ? " archik-header-host--pinned" : ""}`}>
      {/* Only while hidden: once shown, the header itself owns hover (and
          the zone must not cover its top edge). */}
      {!visible && (
        <div className="archik-header-hotzone" aria-hidden="true" onMouseEnter={show} onMouseLeave={scheduleHide} />
      )}
      <div
        ref={ref}
        className={`archik-header${visible ? " archik-header--visible" : ""}`}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(e) => {
          if (!ref.current?.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
